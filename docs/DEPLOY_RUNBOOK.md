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
- [ ] **Questions fixed in the admin panel.** Numbers are from the reviewed topic proposals.
  - [ ] `67e2f3bff5addb214fc6a82d`: option `'Box Magic'` appears twice. The admin forms refuse to
    save a question with duplicate options, and the answer is matched by text, so make every
    option different.
  - [ ] `67dd83578e2ddadc28e387f6` (#2): wrong answer. The code prints `foo` and then `main`, but
    the stated answer is `main`, and no option matches the real output.
  - [ ] `67e2ba44f5addb214fc6a7ed` (#54): the answer contains a memory address
    (`<generator object at 0x100>`). A real run prints `<generator object foo at 0x…>` with a
    different address every time, so no fixed answer can match. Change the question so its output
    is deterministic. The answer also writes `[ ]` for `[]`.
  - [ ] `67e2dbc0f5addb214fc6a7fc` (#61): the answer quotes an error message that changed in Python
    3.10 (`what()` vs `Test.what()`). The site states "Answers assume Python 3.9 or newer", so make
    the answer version-independent, e.g. name the exception type only.
  - [ ] `67e2df32f5addb214fc6a806` (#66): the answer quotes a SyntaxError message that changed in
    Python 3.12 ("non-default argument follows default argument" vs "parameter without a default
    follows parameter with a default"). Same fix as #61.
  - [ ] **The five answer-formatting cases** (`npm run verify-questions` reports them as
    mismatches):
    - [ ] `67e04c89be7a85e233ca8163` (#21): `[ (1, 2) ]` etc., but Python prints `[(1, 2)]`;
    - [ ] `67e0595cbe7a85e233ca816a` (#24): `[ ]`, but Python prints `[]`;
    - [ ] `67e05cb0be7a85e233ca8170` (#27): `[ ]`, but Python prints `[]`;
    - [ ] `67e04ad8be7a85e233ca815d` (#18): the answer drops the ` | ` that the code prints
      (`Name: name | Age: age`);
    - [ ] `67e05bfebe7a85e233ca816e` (#26): the answer drops the trailing ` |` that the code prints.
  - To re-check after editing, export the questions (content only) to a JSON file in `tmp/`, map
    nothing (v2 stores `answer`), and run `npm run verify-questions -- --file <that file>`. Only
    the questions above should be reported, and none once they're fixed.
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

## Afterwards

- Close the tunnel (Ctrl-C in its terminal) and `unset PYQUIZ_URI`.
- Keep both backups (2026-09-30 and the pre-deploy one) until v2 has run for a while.
- **Still open after reopening:** misconception tags for the 98 production-only questions (they
  need reviewed proposals; `docs/FIX_PLAN.md`), and the remaining content fixes listed in
  `docs/FIX_PLAN.md`, M4.
