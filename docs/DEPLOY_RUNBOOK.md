# Deploy runbook: converting the production database to v2

These are the exact steps the owner runs from his Mac to convert the production database and
reopen the site on v2. The conversion is `backend/scripts/productionMigration.js` (one ordered,
idempotent script). The findings and decisions behind every step are in `docs/FIX_PLAN.md`,
"Deployment preparation".

**Rehearsed on 2026-10-01** against a fresh local `pyquiz_rehearsal`, restored from
`~/pyquiz-backups/pyquiz-backup-2026-09-30.gz`:
- a dry run, then `--apply`, then a second `--apply` that changed nothing;
- v2 started against the migrated copy, with the quiz, Study, Daily Challenge, dashboard,
  leaderboard and admin panel smoke-tested in a browser;
- a migrated user's dashboard data checked through the API.

The expected numbers below come from that rehearsal.

> If production's database isn't named `pyquiz`, replace `pyquiz` in every `--nsInclude`,
> `--nsFrom` and the confirmation below with its real name.
>
> **Never point these commands at a database you don't mean to change.** Production's database is
> very likely named `pyquiz` (it's the name inside the backup), **the same name as the local dev
> database**. Every production command below goes through the SSH tunnel on local port **27018**,
> never 27017, where the local MongoDB runs.

Values only the owner knows are marked `TODO(author)`.

## 0. Before you start

- The production site is stopped (no app process is writing to the database).
- On the Mac: the repository on the v2 commit to deploy, with `cd backend && npm ci` done. You also
  need `mongodump`/`mongorestore` (installed) and, for the optional queries, `mongosh`
  (`brew install mongosh`).
- **Connection details:**
  - SSH host: `TODO(author)`;
  - SSH user: `TODO(author)`;
  - MongoDB host and port as seen from the server: `TODO(author)` (usually `127.0.0.1:27017`);
  - database user: `TODO(author)` (`authSource=admin`).

## 1. Open the SSH tunnel

In a separate terminal, which stays open for every step that follows:

```bash
ssh -N -L 27018:127.0.0.1:27017 TODO(author)-user@TODO(author)-host
```

(If MongoDB on the server isn't on `127.0.0.1:27017`, change the right-hand side.)

Then, in your working terminal, put the connection string in a variable without it reaching the
shell history or the screen:

```bash
read -rs "PYQUIZ_URI?Production URI: "; echo
# type: mongodb://<db-user>:<password>@127.0.0.1:27018/pyquiz?authSource=admin
export PYQUIZ_URI
```

(`read -rs` is the zsh form; in bash, use `read -rsp "Production URI: " PYQUIZ_URI`.)

## 2. Take a fresh backup

```bash
mkdir -p ~/pyquiz-backups
BACKUP=~/pyquiz-backups/pyquiz-backup-$(date +%F)-predeploy.gz
mongodump --uri="$PYQUIZ_URI" --archive="$BACKUP" --gzip
```

**Check the backup** by restoring it into a scratch database on the **local** MongoDB, never
production, and counting its documents:

```bash
mongorestore --uri="mongodb://127.0.0.1:27017" --archive="$BACKUP" --gzip \
  --nsInclude='pyquiz.*' --nsFrom='pyquiz.*' --nsTo='pyquiz_backupcheck.*'
mongosh --quiet "mongodb://127.0.0.1:27017/pyquiz_backupcheck" \
  --eval 'db.getCollectionNames().sort().forEach(c => print(c, db[c].countDocuments()))'
```

Expected (as on 2026-09-30): `questions 146`, `users 60`, `quizsessions 247`, `contacts 0`,
`quizprogresses 0`, `resetpasswords 0`. Different numbers mean the database changed since the rehearsal. That's fine,
but compare the dry run below carefully. Drop the scratch copy afterwards:
`mongosh --quiet "mongodb://127.0.0.1:27017/pyquiz_backupcheck" --eval 'db.dropDatabase()'`.

## 3. Dry run

```bash
cd backend
node scripts/productionMigration.js --uri "$PYQUIZ_URI"
```

**The first lines must show the tunnel and the production database:**

```
Target host: mongodb://127.0.0.1:27018
Database:    pyquiz
Questions:   146
Users:       60
Mode:        dry run (no writes)
```

If the port isn't 27018 or the counts are unexpected, stop.

**Expected plan** (from the rehearsal, if production hasn't changed since the backup of 2026-09-30):

| Step | Count | Notes |
|---|---|---|
| 1 `answer-field` | 146 | |
| 2 `duplicate-q25` | 1 | history moved for 2 users, duplicate entry removed for 4 |
| 3 `seed-questions` | 47 | one line per seed question |
| 4 `other-questions` | 98 | |
| 5 `username-lower` | 52 | 8 accounts skipped, listed by id |
| 6 `user-defaults` | 60 | |
| 7 `answer-history` | 60 | 43 with entries, 994 entries, 0 dangling |
| 8 `old-sessions` | 247 | |
| 9 `quizprogresses` | 1 | |
| 10 `indexes` | 13 | |

The verification section of a dry run shows FAIL lines. That is expected before the migration.

If the script prints `Refusing: … unexpected finding(s)`, nothing was changed. Don't apply; send the
listed findings (ids only) for review.

## 4. Apply

```bash
node scripts/productionMigration.js --uri "$PYQUIZ_URI" --apply
```

It asks: `Type the database name (pyquiz) to apply the migration:`. Type `pyquiz` and press Enter.
Anything else aborts without writing.

**Expected result** (from the rehearsal):
- **Steps:** they report 146, 1, 47, 98, 52, 60, 60, 247, 1 and 13 changed.
- **Verification:** every check is PASS.
- **One WARN:** `1 to fix in a content pass: 67e2f3bff5addb214fc6a82d` (see section 7).
- **Counts:** `misconception tags stored: 39` and `answer-history rows: 990`.
- **Verdict:** `NOT READY TO REOPEN`, with 8 users without `usernameLower`, listed by id. This is
  expected until step 6.

**Exit code:**
- **2:** migrated, but not ready to reopen;
- **0:** migrated and ready;
- **1:** failed or refused.

To see it, run `echo $?` right after the command.

The script is idempotent. If it stops partway (a dropped tunnel, for example), reopen the tunnel
and run the same `--apply` again; it only does what is still missing.

## 5. Verification queries

The script's own checks are the main verification. Re-run the dry run at any time:
`node scripts/productionMigration.js --uri "$PYQUIZ_URI"`. After the apply, every step plans 0.

**Optional spot checks** with `mongosh` (use the same `$PYQUIZ_URI`, so through the tunnel):

```bash
mongosh --quiet "$PYQUIZ_URI" --eval '
print("questions", db.questions.countDocuments());                                     // 145
print("legacy question fields", db.questions.countDocuments({ $or: [
  { correctAnswer: { $exists: true } }, { topics: { $exists: true } } ] }));            // 0
print("questions with tags", db.questions.countDocuments({ "distractors.0": { $exists: true } })); // 18
print("answer history rows", db.useransweredquestions.countDocuments());                 // 990
print("users with legacy array", db.users.countDocuments({ answeredQuestions: { $exists: true } })); // 0
print("users without usernameLower", db.users.countDocuments({ usernameLower: { $exists: false } })); // 8
print("quiz sessions", db.quizsessions.countDocuments());                               // 0
printjson(db.getCollectionNames().sort());
// answerevents, contacts, dailychallengesets, questions, quizsessions, resetpasswords,
// useransweredquestions, users
printjson(db.questions.aggregate([{ $group: { _id: "$primaryTopic", n: { $sum: 1 } } },
  { $sort: { n: -1, _id: 1 } }]).toArray());'
```

**Expected primary-topic counts (145):** functions 25, inheritance 19, classes 17, mutability 15,
scope 13, generators 11, dicts 8, exceptions 7, loops 7, types 6, strings 5, lists 4, sets 4,
slicing 2, numbers 1, tuples 1.

## 6. Resolve the username collisions

The 8 accounts listed under `NOT READY TO REOPEN` form 4 pairs whose usernames differ only in case.
Until each pair is resolved, the second account of a pair to save anything gets a duplicate-key
error, because v2 sets `usernameLower` on save and the unique index refuses the second one.

1. For each pair, decide which account keeps the name, then rename the other (`TODO(author)`: how
   you resolve them). Inspect the pairs with the read-only query in `docs/FIX_PLAN.md`
   ("Username collisions (M6)"), against `$PYQUIZ_URI`.
2. Then set `usernameLower` on each of the 8. The simplest way is to run the runbook again with
   `--apply`: its `username-lower` step backfills every account whose username no longer collides.
3. Run the dry run. It must end with `READY TO REOPEN: every check passed and every user has
   usernameLower.`

## 7. Before reopening the site (checklist)

Don't reopen until every box is ticked.

- [ ] **Dry run says `READY TO REOPEN`** (section 6).
- [ ] **Lowercase the stored emails, before the new code serves logins.** Code from branch
  `fix/real-data-audit` on normalizes emails to lowercase at registration, login and password
  reset. 3 production accounts have capital letters in their stored email, and they couldn't log
  in until this has run. It's a dry run first, then apply; type the database name to confirm:

  ```bash
  cd backend
  node scripts/lowercaseEmails.js --uri "$PYQUIZ_URI"           # expect: Emails to lowercase: 3 account(s)
  node scripts/lowercaseEmails.js --uri "$PYQUIZ_URI" --apply   # expect: Lowercased 3 account email(s)
  ```

  It refuses (and changes nothing) if two accounts would end up with the same email; the copy of
  2026-10-01 has none. A second run reports `Nothing to change`.
- [ ] **Content fixes applied with the script.** The owner-approved fixes for the 20 questions in
  `docs/CONTENT_FIXES.md` (options, answers, explanations and one snippet) are in
  `backend/database/contentFixes.json`. `backend/scripts/applyContentFixes.js` applies them.
  - **Its rules:** it applies a question only if its current content is exactly what the fixes
    expect, skips one that is already fixed, and refuses to change anything at all if any question
    differs (for example, one edited in the admin panel meanwhile). Each refusal lists the id and
    the field. It also refuses if a change would drop a misconception tag.
  - **Run it** with the tunnel open (section 1); it's a dry run first, then apply, typing the
    database name to confirm:

    ```bash
    cd backend
    node scripts/applyContentFixes.js --uri "$PYQUIZ_URI"
    #   expect: 20 content fixes: 20 to apply, 0 already applied, 0 unexpected.
    node scripts/applyContentFixes.js --uri "$PYQUIZ_URI" --apply
    #   expect: Applied 20 of 20 fix(es).
    #           All 20 content fixes are in place, and every fixed question passes the v2 validators.
    ```

  - **Check afterwards:** a second dry run says `0 to apply, 20 already applied`, and the
    runbook's dry run (`node scripts/productionMigration.js --uri "$PYQUIZ_URI"`) ends with
    `READY TO REOPEN` and **no WARN line** (the duplicated Box Magic option was the last one).
  - **Rehearsed** on 2026-10-01 against `pyquiz_verify`, a local copy of production taken after the
    conversion and the email fix:
    - the fixes changed exactly the 20 listed questions, in exactly the approved fields;
    - `npm run verify-questions` passed 145 of 145 questions on Python 3.9 and 3.14;
    - an API round trip over all 145 (a wrong option scores incorrect, the stored answer scores
      correct) passed;
    - the runbook's dry run said READY TO REOPEN with no WARN.

- [ ] **v2 deployed** (`TODO(author)`: how the app is deployed and started on the server, e.g. the
  process manager):
  - code at the deployed v2 commit; `cd backend && npm ci && npm run build`; start with
    `npm run prod` (`NODE_ENV=production`). The frontend is served by `frontend/app.js`.
  - **Backend `.env`:** keys from `backend/env.example`.
    - Keep these from the old site: `MONGO_URI` (or rename it to `MONGODB_URI`), `PORT`,
      `CLIENT_URI` (the frontend origin, now the **only** CORS origin in production), `API_URI`,
      `JWT_SECRET`, `EMAIL_USER`, `EMAIL_PASS`.
    - **New:** `DAILY_CHALLENGE_SEED_SECRET` (required for the Daily Challenge); `TRUST_PROXY=1`
      if a reverse proxy (e.g. nginx) is in front; `METRICS_TOKEN` (optional; without it
      `/metrics` returns 404).
    - Leave `ENABLE_API_DOCS` unset.
  - **Frontend:** `PRODUCTION_API_URL` defaults to `https://api-pyquiz.picsartacademy.am`, the
    current API address, so nothing to set unless it changes.
  - **No extra MongoDB packages needed:** the production connection string only uses
    `authSource=admin`.
  - **Everyone logs in again once:** v2 uses new cookie names, so existing logins end.
- [ ] **Smoke test on the live site:** guest quiz; register and log in; a Classic quiz on a new
  topic (e.g. Scope & Namespaces); Study filtered by Classes & Objects; the Daily Challenge; the
  dashboard; the leaderboard; the admin login, question list (filter Inheritance & MRO) and editing a
  question.

## 8. Rollback (only if something is wrong)

The backup from section 2 is the archive of the old database. To return to it:

1. **Stop the app** (`TODO(author)`).
2. **Drop the collections the old site didn't have**: v2 and the migration created them, and the
   backup doesn't contain them, so a restore wouldn't remove them.

   ```bash
   mongosh --quiet "$PYQUIZ_URI" --eval '
   ["answerevents", "dailychallengesets", "useransweredquestions"].forEach(c => {
     if (db.getCollectionNames().includes(c)) { db[c].drop(); print("dropped", c); } });'
   ```

3. **Restore the backup over the production database.** `--drop` replaces every collection that's
   in the archive (questions, users, quizsessions, quizprogresses, contacts and so on, with their
   original indexes).

   > With an archive, `mongorestore` writes into the database names **stored in the archive**
   > (`pyquiz`), whatever database the `--uri` names (checked with `--dryRun` on 2026-10-01). So the
   > `--uri` must point at production **through the tunnel (port 27018)**. Pointed at the local
   > MongoDB (27017), this command would overwrite the local dev database `pyquiz`. Add `--dryRun`
   > first to see where it would restore.

   ```bash
   mongorestore --uri="$PYQUIZ_URI" --archive="$BACKUP" --gzip --drop --nsInclude='pyquiz.*'
   ```

   Check it with the backup-check counts from section 2, now against `$PYQUIZ_URI` (146, 60, 247).
4. **Redeploy the old code**: commit `9b0d8b4` plus `~/pyquiz-backups/pyquiz-server-changes.patch`.

## 9. Putting v2.1 on the server

The production **database** is done: converted, emails lowercased, content fixes applied, READY TO
REOPEN, with a final backup. This section puts the **code**, tag `v2.1` (the merge of
`fix/real-data-audit` into `main`), on the server and starts it.

> **The server's processes run under another user (`john`).** How v2.1 is started and kept running
> (systemd, pm2, a screen session, …), under which user, and who may restart it must be **agreed
> with the server owner** first: `TODO(author)`. The commands below show *what* has to run, not
> how the server owner prefers to run it.

### 9.1 Get v2.1 onto the server

1. **From the Mac, push `main` and the tag** (Claude Code didn't push):
   `git push origin main && git push origin v2.1`.
2. **On the server, in the app's directory** (`TODO(author)`: path):
   - **Keep the old server changes.** The server's checkout has 11 uncommitted modified files on
     top of `9b0d8b4`, and the checkout would refuse to overwrite them. They're already saved in
     `~/pyquiz-backups/pyquiz-server-changes.patch` on the Mac. On the server, set them aside too:

     ```bash
     git status --short                                   # the 11 modified files
     git stash push -m "pre-v2.1 server changes (9b0d8b4 + patch)"
     ```

   - **Keep the existing `.env` files.** They are untracked (and ignored in v2), so the checkout
     leaves them in place. Copy them aside anyway: `cp backend/.env ~/env-backend-pre-v2.1`.
   - **Check out v2.1:**

     ```bash
     git fetch origin --tags
     git checkout v2.1            # a detached HEAD at the tag, which is fine for a deployment
     git log -1 --oneline         # 2a7d11a Merge branch 'fix/real-data-audit': …
     ```

### 9.2 Environment variables

v2 reads `backend/.env` and `frontend/.env` (dotenv; each app reads the file in its own directory).
The names below come from `backend/env.example` and `frontend/.env.example`. **Generate new secrets
on the server** (e.g. `openssl rand -hex 32`); never paste them into a chat, a ticket or the
repository.

**Backend (`backend/.env`):**

| Variable | Value |
|---|---|
| `NODE_ENV` | `production`. **Required:** secure `__Host-` cookies, JSON logs, `/api-docs` off, `/metrics` protected. `npm run prod` sets it too. |
| `PORT` | The port the reverse proxy forwards to (keep the old site's value). |
| `MONGODB_URI` | **New: it contains the new database password.** `mongodb://<user>:<new password>@<host>:<port>/pyquiz?authSource=admin`, plus `&directConnection=true` if the server connects to a single member of a replica set by its address (`TODO(author)`: check against the server's MongoDB setup). The old name `MONGO_URI` still works, with a warning; rename it. |
| `JWT_SECRET` | **New.** A new random secret. Every existing login ends, which already happens because v2 uses new cookie names. |
| `DAILY_CHALLENGE_SEED_SECRET` | **New, required** for the Daily Challenge. A random secret, different from `JWT_SECRET`. |
| `EMAIL_USER` | The Gmail address password-reset and contact mails are sent from (keep it). |
| `EMAIL_PASS` | **New:** the new Gmail **app password** for `EMAIL_USER`. |
| `CLIENT_URI` | The frontend's origin, e.g. `https://pyquiz.example` (`TODO(author)`: the real one, keep the old value). In production it is the **only** origin the API accepts (CORS), and the base of password-reset links. |
| `API_URI` | The API's public URL, `https://api-pyquiz.picsartacademy.am` (keep it). |
| `TRUST_PROXY` | `1`: exactly one reverse proxy (nginx) in front. Never `true`. |
| `METRICS_TOKEN` | **New**, optional. A random token for `GET /metrics`; without it, `/metrics` returns 404 in production. |
| `ENABLE_API_DOCS` | Leave unset, so `/api-docs` stays off in production. |
| `REDIS_URL` | Leave unset; not used in production. |
| `LOG_LEVEL` | Optional (`info` by default). |
| `BENCHMARK_DISABLE_RATE_LIMITS` | **Never set** on the server (it's ignored in production anyway). |

**Frontend (`frontend/.env`):**

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | The port the reverse proxy forwards the site to (keep the old site's value). |
| `PRODUCTION_API_URL` | Leave unset: it defaults to `https://api-pyquiz.picsartacademy.am`. Set it only if the API moves. |
| `API_URL` | Not used in production (only when the page is opened on `localhost`). |

The old server's `config.js` hard-coded the API address. v2 serves `/js/config.js` from
`frontend/app.js` instead, so there's nothing to edit in the code.

### 9.3 Install, build, start

Node.js 20 (v2.1 was tested with 20.11; `TODO(author)`: check `node --version` on the server).

```bash
cd backend
npm ci                 # clean install from package-lock.json
npm run build          # webpack -> dist/server.js; about 10 "Module not found" warnings for
                       # optional MongoDB packages are expected and harmless
npm run prod           # NODE_ENV=production node dist/server.js  (reads backend/.env)

cd ../frontend
npm ci
NODE_ENV=production npm start      # node app.js (reads frontend/.env)
```

Run both under the agreed process manager and user, so they restart on failure and on reboot.
Nothing in the database needs to be done at startup: the indexes already exist (the runbook built
them), so the app's index build at startup finds them all present and changes nothing.

**Checked locally on 2026-10-01:** the `v2.1` bundle (`npm run build`, then `node dist/server.js`
with `NODE_ENV=production`) starts and answers `/readyz` and the API, `/api-docs` returns 404, and
`/metrics` without a token returns 404.

### 9.4 Smoke test on the live site

1. **Health:** `curl -s https://api-pyquiz.picsartacademy.am/readyz` gives `{"ready":true,"dbState":1}`.
2. **About:** shows **145** questions and **16** topics.
3. **Guest:** a Classic quiz. Answer a question; Next stays disabled until the question is resolved.
4. **Log in** with a real account. Expect a one-time re-login: the cookies and `JWT_SECRET` are new.
   Then play a Blitz and a Survival quiz.
5. **Study:** filter by **Classes & Objects** and by **Scope & Namespaces** (production-only topics).
   Line breaks show in explanations.
6. **Daily Challenge:** complete it; the result shows, with bonus points for each correct answer.
7. **Dashboard:** points, rank, accuracy and topic mastery show without `undefined`/`NaN`.
8. **Leaderboard:** shows the top 50 users.
9. **Password reset:** request a reset for your own account. The email arrives (this proves the new
   Gmail app password) and the link opens on `CLIENT_URI`.
10. **Admin panel:**
    - log in; open **Manage Questions**, filter **Inheritance & MRO**;
    - use **Find by id** on `67e2f3bff5addb214fc6a82d` (18 options, all different);
    - open **Users**, check paging, and **Contacts**.
11. **Security:** `curl -s -o /dev/null -w "%{http_code}" https://api-pyquiz.picsartacademy.am/api-docs` gives
    `404`, and `/metrics` without `Authorization: Bearer <METRICS_TOKEN>` gives `401`, or `404` if
    no token is set.
12. **Logs:** the backend log shows no errors during all of this.

### 9.5 If v2.1 has to be rolled back

The old code (`9b0d8b4` + the server patch) **cannot** run on the converted database. Rolling back
the code means rolling back the data as well:
1. Stop v2.1.
2. Restore the **pre-conversion** backup (`~/pyquiz-backups/pyquiz-before-conversion.gz`) as in
   section 8.
3. `git checkout 9b0d8b4 && git stash pop` (the stash from 9.1).
4. Start the old app as before.

Everything since the conversion (the content fixes, and any new users or answers) would be lost,
so prefer fixing forward.

## Afterwards

- Close the tunnel (Ctrl-C in its terminal) and `unset PYQUIZ_URI`.
- Keep both backups (2026-09-30 and the pre-deploy one) until v2 has run for a while.
- **Still open after reopening:** misconception tags for the 98 production-only questions (they
  need reviewed proposals; `docs/FIX_PLAN.md`), and the remaining content fixes listed in
  `docs/FIX_PLAN.md`, M4.
