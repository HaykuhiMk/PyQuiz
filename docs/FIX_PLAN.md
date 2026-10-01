# Fix plan — resumption document

Resumption document for the `fix/review-weaknesses` audit/remediation task, written so a fresh
session can do the remaining work (Phase 6) without the conversation that produced Phases 0–5.
Branch: `fix/review-weaknesses`. Last updated after the password-trimming fix (2026-09-30); the
status below also records the concept-graph work (branch `feature/concept-graph`, 2026-10-01).

## Status so far

**Phases 0–6 are complete and committed.** Phase 6 rewrote
`docs/PYQUIZ_CURRENT_SYSTEM_DESCRIPTION.md` (21 sections, 4 Mermaid diagrams checked with
mermaid-cli, a generated endpoint table, TODO(author) placeholders for Related Work, Pedagogical
Background, the user study and deployment details) and added `docs/evaluation/questionnaire.md`.
**Remaining:** the Final report (instructions at the end of this document) and the author's
TODO(author) items in those two files.

**Concept graph ("foundation 2") is complete** on branch `feature/concept-graph` (not merged, not
pushed by Claude). All three stages are done:
- the stable topic ids;
- the graph config and endpoint;
- misconception tags on wrong options, recorded on every answer event, with no learner-facing
  feedback yet;
- the 39 seed tags, applied to the seed file and the local dev database;
- the seed content fixes;
- the reference Python version, with `npm run verify-questions`.

Read `docs/CONCEPT_GRAPH.md` (status, §3 rules, §6–§7 implementation) and Section 5.14 of the system
description before continuing that work.

**Production conversion done (2026-10-01, by the owner): READY TO REOPEN.** Then a real-data audit
on `pyquiz_realcopy`, a local exact copy (branch `fix/real-data-audit`, not merged, not pushed by
Claude). It found and fixed:
- paged lists showing an empty last page (60 users is exactly 3 pages);
- the Classic/Survival Next and exhausted-attempts states;
- explanation line breaks and the tab width;
- the admin question list: its id and code columns, and find by id;
- case-sensitive emails: now lowercase everywhere, plus `scripts/lowercaseEmails.js` for the 3
  stored mixed-case emails, which must run before the new code serves logins (`DEPLOY_RUNBOOK.md`
  checklist);
- the missing favicon;
- the verifier's rule for "output, then error".

The content problems, by id, are in `docs/CONTENT_FIXES.md`. The owner fixes them in the admin
panel.

**Deployment preparation is paused** (production data migration). Read "Deployment preparation
(paused)" below before any deploy or any work against `pyquiz_prodcopy`. Full detail, evidence and
reasoning for every item live in `docs/AUDIT.md` (one addendum per phase). This document only
indexes it, plus the facts Phase 6 needs (see "Facts for Phase 6" below).

Commit history for this task, oldest first:
- `d8ad91e` — Phase 0: audit (16 items, `docs/AUDIT.md` created)
- `551a7d4` — Phase 1: server-authoritative quiz sessions
- `3c0445b` — Phase 1 follow-ups: attempt-based scoring, guest session hardening, coverage
- `9b35735` — Phase 2: Study mode and Daily Challenge integrity
- `f38ea66` — Pre-Phase-3: trust proxy config, Daily Challenge secret failure mode, transition note
- `442ca04` — Phase 3: data consistency and statistics (everything except the taxonomy migration)
- `120e5ae` — Phase 3 follow-ups + revised taxonomy proposal (awaiting approval at the time)
- `39aa508` — Phase 3: canonical topic taxonomy migration and admin form restriction
- `732d281` — Phase 3 follow-up: production migration safety, dashboard mastery cap removed
- `739dc83` — this resumption document
- `0f38505` — permanent `CLAUDE.md` project guide
- `98b06d7` — Phase 4: security hardening
- `13fce23` — Phase 4 follow-up: `MONGODB_URI` everywhere, `MONGO_URI` fallback with a warning
- `efe859c` — Phase 4 follow-up: CORS allow-list tests
- `1d379b4` — Phase 4 follow-up: public `GET /questions/stats` for the About page (Phase 2 regression)
- `e84506e` — consolidated production deployment checklist in `docs/AUDIT.md`
- `6a29b92` — Phase 5: testing and tooling
- `c71a7d4` — Phase 5 follow-up: removed public `POST /questions/:id/check` (leaked Daily answers)
- `93dafed` — Phase 5 follow-up: avatar route 1 MB body limit, readable "image too large" error
- `c6eb877` — Phase 5 follow-up: change-password uses the registration password rule
- `576b69b` — Phase 5 follow-up: admin login returns one generic error
- `28ecc54` — this document: Phases 0–5 complete, Phase 4/5 decisions
- `e32468e` — password rule defined once (`config/validationRules.js`), served by
  `GET /api/v1/validation-rules`; register/reset/settings derive their checks from it
- `2ca18a0` — landing page buttons wired up before the `/auth/me` check (Phase 4 race)
- `0942d13` — avatar picker enforces the server's real limit (374,982 bytes / 366 KB) before upload
- `36f0ae3` — user login: same bcrypt work and generic error for an unknown email
- `8f94663` — docs: remaining-items fixes recorded, Phase 6 facts refreshed
- (next commit) — passwords are never trimmed on any page; server verified not to trim either

## Every decision made so far (index — see docs/AUDIT.md for full reasoning and evidence)

**Phase 1 — server-authoritative quiz sessions:**
- Blitz pause-on-wrong-answer: simplified to no pause — the deadline is fixed at serve time and
  never recomputed on a retry (user's choice; "Phase 1 addendum," DECISION 1).
- Cross-session points policy: first-attempt-correct-ever awards points; any repeat, or a
  correct answer on attempt 2/3, awards 0 but still counts toward accuracy/topicStats (DECISION 2,
  narrowed to "first-attempt" specifically in the Phase 1 follow-ups after a review comment).
- Existing farmed points: left untouched. `backend/scripts/resetFarmedPoints.js` was written
  (dry-run by default) but **never run** against any database (DECISION 3) — still true today.
- Guest `AnswerEvent`s: not recorded at all, since guests have no durable identity to attribute
  them to (DECISION 4).
- Breaking change: `POST /api/v1/users/user-progress` was removed (client could set mode/outcome
  directly); frontend updated in the same phase.

**Phase 2 — Study mode and Daily Challenge:**
- Study mode now requires authentication (was fully public) and excludes today's frozen Daily
  Challenge set.
- Daily Challenge day boundary: Asia/Yerevan, not UTC (user's choice). Next reset time is now
  returned by the API and shown on the page.
- Daily Challenge seed: HMAC-SHA256(server secret, date) feeding a documented `mulberry32` PRNG +
  Fisher–Yates shuffle, replacing an unkeyed, predictable SHA-256 scheme.
- Daily Challenge answers **do** count toward `UserAnsweredQuestion`/`topicStats`/streaks, same as
  quiz sessions (decision made and implemented consistently) — but the flat 20-point daily bonus is
  awarded separately from, and in addition to, the ordinary first-correct-ever points rule.

**Pre-Phase-3 / Phase 3:**
- `TRUST_PROXY` is a required env var read at startup (hop count, or `"true"` — logs a warning if
  `"true"` is set, since it lets a client spoof `req.ip`). The general `/api` limiter and the quiz
  session-creation limiter both key by `user:<id>` for authenticated requests and `ip:<address>`
  for guests, with separate budgets.
- Topic mastery (coverage + accuracy) is computed **live** from `UserAnsweredQuestion` +
  `AnswerEvent` joined against the current `Question` collection, not from an incrementally-updated
  counter (chosen over "provide a recompute script" — structurally can't drift or exceed 100%).
- Classic exclusion narrowed to `everCorrect` questions only (not "ever answered"); added a
  `practiceMode` that bypasses the exclusion and a `canPracticeAgain` flag when the pool is
  exhausted (user's decision).
- Case-insensitive username uniqueness: **enforced** (user's decision). Migration scripts
  (`backfillUsernameLower.js`, `reportDuplicateUsernames.js`) exist but have **not** been run
  against any database with real user data yet.
- Leaderboard now returns a server-computed `isCurrentUser` boolean; avatar is excluded by default
  via a `.select('-avatar')` projection everywhere except the one profile endpoint that needs it.
- Topic taxonomy: **11 canonical topics** (`backend/config/topicTaxonomy.js`), approved and
  migrated against the local dev database only. Every question has exactly one required
  `primaryTopic` and optional `secondaryTopics`. Quiz/Study filters match primary OR secondary;
  mastery/weak-topic detection uses primary only. Zero-question topics are hidden from filters and
  the mastery list automatically; 1–2 question topics show "Not enough questions yet." User's
  explicit decisions on this round: keep all 11 topics (don't merge the thin ones), hide
  zero-question topics, add the "not enough questions yet" state, dual-mode filtering as above, and
  a "Content gaps" section in `docs/AUDIT.md` (Numbers & Arithmetic, Tuples, Indexing & Slicing —
  target ≥3 primary questions each). Migration has still only ever run against the **local dev
  database** — never production; see the consolidated "Production deployment checklist (all
  phases)" at the end of `docs/AUDIT.md` before ever running `--apply` against production.
- `MIN_ACCURACY_EVENTS`/`MIN_QUESTIONS_FOR_MASTERY` = 3 (named constants,
  `backend/config/masteryConfig.js`); a "measuring" mastery state was added for topics with
  coverage but too few recorded attempts, separate from "unavailable" (too few questions to ever
  measure).

**Phase 4 — security (all decisions made in advance by the owner; `docs/AUDIT.md` "Phase 4
addendum"):**
- Session invalidation: `User.tokenVersion` in every user/admin JWT, checked on every
  authenticated request; incremented on ban (not unban), password change and password reset.
  Banned users are rejected per request and at login. Tokens issued before this field existed count
  as version 0, so deploying didn't force a logout by itself.
- Admin auth: moved from a `localStorage` Bearer token to a **separate** httpOnly cookie
  (`adminToken`, `__Host-adminToken` in production) with its own HMAC-bound CSRF token, enforced
  on every state-changing admin route. `verifyAdmin` accepts only that cookie (no Authorization
  header, never the user cookie) and re-checks `role === 'admin'` in the database. New
  `POST /admin/logout` and `GET /admin/me`. **Breaking:** admin login no longer returns
  `data.token`.
- CSRF: `__Host-` prefix on session and CSRF cookies **in production only**. Development over plain
  http uses unprefixed, non-Secure names, since browsers refuse `__Host-` over http; documented in
  `backend/env.example`. The CSRF token is `HMAC-SHA256(JWT_SECRET, "csrf:" + session JWT)`,
  compared with `timingSafeEqual`.
- Cross-host frontend (the API is on `api-pyquiz.picsartacademy.am`, a different host): login and
  both `/me` endpoints also return `csrfToken` in the body. The frontend keeps it in memory only
  and re-fetches it from `/me` after every page load. CORS reflects only allow-listed origins
  (tested, `efe859c`).
- Login-state detection: new `GET /api/v1/auth/me`. The frontend derives logged-in state from it,
  not from cookie presence, and on any 401 clears state and redirects to login.
- Contact form: auto-reply **dropped entirely**. The message is still saved and the admin still
  notified.
- Reset tokens: only a SHA-256 hash is stored, compared with `crypto.timingSafeEqual`.
- `/metrics`: requires `Authorization: Bearer $METRICS_TOKEN` in production, 404 if unset.
  `/api-docs`: off in production unless `ENABLE_API_DOCS=true`.
- CSP: the backend has `script-src 'self'`. The frontend has Helmet, whose CSP allows Prism.js
  (jsDelivr), Font Awesome (cdnjs), Google Fonts and the two API origins, with **no
  `'unsafe-inline'` for scripts**. The inline theme bootstrap, the `admin.html` redirect and all
  inline `onclick=` handlers were moved to external files. `style-src` keeps `'unsafe-inline'`, a
  documented exception.
- Follow-ups:
  - `MONGODB_URI` is canonical, with `MONGO_URI` still read as a fallback plus a startup warning
    (`backend/config/mongoUri.js`).
  - The About page's question count had been broken since Phase 2 (it read the login-only Study
    endpoint). It now uses the new public, aggregate-only `GET /api/v1/questions/stats`.

**Phase 5 — testing and tooling (all decisions made in advance by the owner; `docs/AUDIT.md`
"Phase 5 addendum"):**
- Coverage: real line **and** branch coverage over all runtime code (`npm run test:coverage`).
  "Before" was measured by checking out `d8ad91e` and running the same config, so both figures
  cover the same file set.
- Playwright: minimal `e2e/` suite (7 tests): guest quiz, login/logout, Classic quiz, Daily
  Challenge, theme toggle, About page counts, and CSRF re-fetch after a reload. It uses its own
  servers and a local `pyquiz_e2e` database that it drops and re-seeds, and fails on any CSP
  violation or page error.
- Swagger: every endpoint annotated. `tests/swagger.test.js` walks the Express router and fails if
  the spec and the routes diverge.
- BullMQ email queue: **skipped**, documented as future work.
- `scripts/benchmark.js` (autocannon):
  - Targets localhost by default; the target is never read from env, and anything else needs an
    explicit `--url`.
  - One local run is recorded in AUDIT.md with the machine and dataset.
  - `BENCHMARK_DISABLE_RATE_LIMITS` was added (ignored in production, re-checked per request) so
    the benchmark measures endpoints rather than 429s.
- Webpack / `tsc` justifications: stated plainly that `tsc --noEmit` runs with `checkJs: false`, so
  it is a syntax check, not JSDoc type checking (enabling `checkJs` reports 1,564 errors today).
- Follow-ups (owner's decisions, 2026-09-30):
  - **Removed** `POST /api/v1/questions/:id/check`. It was public and returned answers and
    explanations for any question, including today's Daily Challenge. Nothing in the frontend had
    called it since Phase 1. **Breaking API change.**
  - The `reveal: "false"` parsing bug disappeared with that endpoint (it was the only
    `z.coerce.boolean()`).
  - The avatar route gets its own 1 MB body limit, so an oversized image returns
    "Image is too large" rather than 413.
  - Change-password uses exactly the registration password rule.
  - Admin login returns one generic 401 "Invalid credentials" for an unknown username, a non-admin
    account and a wrong password, with equal bcrypt work in each case.
- Second round of follow-ups (owner's decisions, 2026-09-30):
  - **Single definition of client-facing validation rules.** `backend/config/validationRules.js`
    holds the password rule (min length, a RegExp source string, the requirements wording) and the
    avatar limit. The Zod schemas and services read it, and the public, input-free
    `GET /api/v1/validation-rules` serves it. The register, reset and settings pages build their
    checks and help text from that response via `frontend/public/js/validationRules.js`, so there
    is no client copy to drift. If the fetch fails, the client check is skipped and the server
    still validates.
  - Avatar picker: the real maximum is a 500,000-character data URL, which is 374,982 bytes (366 KB)
    of file after base64. The picker checks it before reading and before uploading, with the
    server's "Image is too large. The maximum is 366 KB." message.
  - User login: an unknown email does the same single bcrypt comparison (against a dummy hash) and
    gets the same 401 as a wrong password. The shared `utils/passwordCheck.js` is used by both user
    and admin login.
  - Found and fixed while testing: since Phase 4 the landing page bound its buttons only after
    `/auth/me` answered, so an early click did nothing.
  - Passwords are never trimmed (owner's decision). The register, login and admin-login pages used
    to `.trim()` the password; reset and change-password didn't, so a password set there with
    surrounding spaces could never be used to log in. The server never trimmed passwords, and tests
    now pin that. Emails and usernames are still trimmed.

## Facts for Phase 6 (all measured, as of the password-trimming fix)

- **Tests.** Backend: **265 tests across 33 suites**, all passing (`cd backend && npm test`).
  Frontend: the Playwright suite in `e2e/` has **16 tests**, all passing:
  - 7 smoke tests in `smoke.spec.js`;
  - 5 client/server validation tests in `validation.spec.js`;
  - 1 dashboard-label test in `dashboard.spec.js`;
  - 1 admin-session test in `admin.spec.js`;
  - 2 error-message tests in `errors.spec.js`. The baseline before Phase 1 was 89
  tests across 9 suites.
- **Coverage** (`npm run test:coverage`, same config both times):
  - now: **90.17% lines, 76.15% branches** (89.87% statements, 90.80% functions);
  - before (`d8ad91e`): 77.69% lines, 50.39% branches.
  - The Phase 5 addendum records 187 tests / 89.37% / 74.66%. That was at `6a29b92`, before the
    follow-ups; use the numbers above.
- **Content.** 47 questions. 11 canonical topics, of which 10 have questions and are therefore
  visible, as returned by `GET /api/v1/questions/stats` on the seed data. Content gaps are listed
  in `docs/AUDIT.md`.
- **API surface.** **40 documented operations on 37 paths.** That is the 40 in the Phase 5
  addendum, minus the removed `POST /questions/:id/check`, plus the new public
  `GET /validation-rules`. Swagger annotations live in `backend/routes/v1/*.js`, and
  `tests/swagger.test.js` guarantees they match the real routes. Generate the Phase 6 endpoint
  table from those route files.
- **Breaking API changes across all phases:**
  - Phase 1: removed `POST /users/user-progress`.
  - Phase 3: `topics` became `primaryTopic`/`secondaryTopics`.
  - Phase 4: admin login no longer returns `data.token` (cookie instead), and the admin
    Authorization header is no longer accepted.
  - Phase 5 follow-up: removed `POST /questions/:id/check`.
  - Admin login now returns 401 instead of 404 for an unknown username.
  - The frontend was updated in the same commit each time.
- **Performance.** The only real measurements are the single local benchmark run in the Phase 5
  addendum (machine and dataset listed there). Don't present them as production capacity.
- **Deployment.** The consolidated production deployment checklist is at the end of
  `docs/AUDIT.md`.
- **Open items noticed but not changed** (candidates for "Current Limitations"):
  - `tsc` doesn't type-check (`checkJs` off).
  - BullMQ email queue not wired up.

## Deployment preparation (resumed 2026-10-01)

**Resumed on 2026-10-01** (the production site is stopped, so no live users and no old code use the
database). The owner runs the conversion of the real database himself, over an SSH tunnel. Claude
runs the runbook only against local rehearsal databases.
- **Stage 1 done:** the migration list was confirmed from the data and the server patch (below).
- **Stage 2 done:** `backend/scripts/productionMigration.js`, one ordered runbook covering the
  whole list, with tests in `backend/tests/productionMigration.test.js`.
- **Stage 3 done (2026-10-01): the rehearsal.**
  - The backup was restored into a fresh `pyquiz_rehearsal` (453 documents), mapping the archive's
    database `pyquiz` to the new name, so the dev database wasn't touched.
  - Dry run, `--apply` (exit 2: migrated, not ready because of the 8 collisions), and a second
    `--apply` that changed nothing.
  - v2 started against it; a browser smoke test passed for the quiz on a new topic, Study, the
    Daily Challenge, the dashboard, the leaderboard and the admin panel.
  - A migrated user's progress and mastery endpoints answered from the migrated history (75
    answered of 145).
  - The test accounts and their data were removed afterwards.
- **Stage 4 done: `docs/DEPLOY_RUNBOOK.md`**, the owner's exact steps: tunnel, fresh backup and
  check, dry run with expected numbers, apply, verification queries, resolving the collisions, the
  "Before reopening" checklist and rollback.
- **Owner's decisions (2026-10-01):** the Stage 2 defaults are confirmed (Q25, M3, M8, M10,
  collisions skipped).
  - Production-only content fixes are deferred to the admin panel, listed in the runbook's
    checklist.
  - CORS is narrowed to `CLIENT_URI` in production.
  - No extra MongoDB packages are needed (the URI uses only `authSource=admin`).
  - The verifier accepts `Error: <message>` and `Nothing`.

### Server patch review (2026-10-01)

`~/pyquiz-backups/pyquiz-server-changes.patch` holds the 11 modified files on top of `9b0d8b4`. It
was read only through a redaction filter, and no value from it is in the repository.
- **No model or schema change.** It doesn't explain `correctAnswer`, `createdBy`/timestamps or
  `contacts`. The server's frontend `questions.js` was patched to read `correctAnswer` instead of
  `answer`, so the questions in production were stored with `correctAnswer` by something outside
  this code (no route in it writes that field), and the frontend was adapted to them.
- **The old `quizsessions`** come from `9b0d8b4` itself (`models/QuizSession.js`, written by
  `POST /start-quiz`, still present in the patched `routes/account.js`). M9 stands.
- **Configuration v2 must keep:**
  - the API address `https://api-pyquiz.picsartacademy.am` (v2's default `PRODUCTION_API_URL`);
  - the backend `.env` values `MONGO_URI` (v2 reads `MONGODB_URI`, then `MONGO_URI`),
    `CLIENT_URI` (CORS origin and reset links), `PORT` and `API_URI`.
- **CORS:** the server removed `API_URI` from the allowed origins. v2 still allows `CLIENT_URI`,
  `API_URI`, `http://localhost:3000` and `http://localhost:3001`. Narrowing that for production is a
  code change, not yet made (owner to decide).
- **Listening:** the server added `app.listen(PORT, '0.0.0.0')`. v2's `app.listen(PORT)` already
  listens on all interfaces.
- **Dependencies:** the server added the MongoDB driver's optional packages (`kerberos`, `snappy`,
  `@mongodb-js/zstd`, `aws4`, `@aws-sdk/credential-providers`, `mongodb-client-encryption`,
  `gcp-metadata`, `socks`). v2's `npm run build` reports exactly these as missing-module warnings
  and succeeds without them. They are needed only if the production `MONGO_URI` uses one of those
  features (compression, AWS or Kerberos authentication, encryption, a SOCKS proxy). The owner
  checks the URI's options, without sharing the value.
- **No change to the migration list.**

Paused on 2026-09-30 at the owner's request, before any migration was applied. **Nothing has been
applied to `pyquiz_prodcopy`** (the local copy of the production database), apart from the index
side effect described under "autoIndex issue" below. No personal data was printed, saved or
committed. Only counts, question ids and question content were used.

### Production version

- **Production runs commit `9b0d8b4`** (2025-04-05, "Update README.md", an ancestor of `main`, 54
  commits before it) **plus 11 uncommitted modified files on the server**. Those files haven't
  been seen yet.
- **The production data doesn't match `9b0d8b4` alone.** At that commit the question model uses
  `answer` and there is no `contact` model (added in `f6bc5fe`, 2025-07-24). Production questions
  use `correctAnswer`, `createdBy`, `createdAt` and `updatedAt`, and a `contacts` collection
  exists. No commit in this repository, on any branch, ever wrote `correctAnswer`, `createdBy` or
  timestamps to questions.
- **The 11 files don't explain them either** (see "Server patch review"). The M1–M11 list stands
  on the data itself.

### The copy as found (counts only)

| Collection | Documents | Notes |
|---|---|---|
| `questions` | 146 | Fields `question`, `code`, `options`, `correctAnswer`, `difficulty`, `topics`, `explanation`, `createdBy`, `createdAt`, `updatedAt`. 78 easy, 15 medium, 5 hard among the 98 unmatched. 3–18 options per question. |
| `users` | 60 | Only `username`, `email`, `password` (all 60 bcrypt cost 10, compatible), `role` (59 user, 1 admin), `answeredQuestions`. No `stats`, `achievements`, `dailyChallenge`, `banned`, `tokenVersion` or `usernameLower`. Total points 0. |
| `quizsessions` | 247 | **Old model** (`email`, `startTime`, `status`) |
| `quizprogresses`, `contacts`, `resetpasswords` | 0 each | |
| `answerevents`, `dailychallengesets` | absent | Created on first use by the new code |

### Migration list (M1–M10) and decisions so far

| # | Collection | Change | Migration | Decision |
|---|---|---|---|---|
| M1 | questions | `correctAnswer` → `answer` | **new script**, with dry run | approved |
| M2 | questions | `topics` → `primaryTopic` + `secondaryTopics`, **written as stable topic ids** | existing `migrateQuestionTopics.js`, plus mappings for the 98 unmatched questions and the new topics | approved (see below) |
| M3 | questions | extra `createdBy`, `createdAt`, `updatedAt` | none needed; the schema ignores them | open: keep or remove |
| M4 | questions | content problems and the duplicated question (see below) | content-fix script, reusable on production | approved once the owner has reviewed `content-fixes.md` |
| M5 | users | backfill `usernameLower` (all 60 users) | existing `backfillUsernameLower.js` | ready |
| M6 | users | case-insensitive username duplicates (4 groups) | existing `reportDuplicateUsernames.js` | **do not rename**; the owner inspects first |
| M7 | users → `useransweredquestions` | `answeredQuestions` array (994 entries, 43 users; all strings, all valid question ids) → collection | existing `database/migrateAnsweredQuestions.js`, which needs a dry-run mode and a native-driver `$unset` | approved; migrated records get `everCorrect: false` (the old history has no correctness), to be documented |
| M8 | users | missing `stats`, `achievements`, `dailyChallenge`, `banned`, `tokenVersion` | none strictly needed (schema defaults, `tokenVersion` treated as 0), but lean reads (leaderboard, auth check) see them as missing | open: proposal to backfill defaults with native writes |
| M9 | quizsessions | old model shares the new model's collection name | drop the collection (the mongodump backup is the archive), as a migration step with a dry run | approved |
| M10 | quizprogresses | model deleted; empty collection | drop | open: proposal |

Also checked: `admins` (none in production; the admin is a `users` row), `resetpasswords` (0
documents, so there's no `resetKey` → hash migration), and the new collections (created on
demand; indexes built at app startup). `resetFarmedPoints.js` would affect **0 users**, because
production has no points. It isn't needed, and note that it **writes by default** (`--dry-run` is
opt-in).

### The runbook: `backend/scripts/productionMigration.js` (Stage 2)

One script, in this order. Each step changes only what still needs changing, so a second run does
nothing.

| Step | Covers | What it does |
|---|---|---|
| 1 `answer-field` | M1 | `correctAnswer` → `answer` (146 questions) |
| 2 `duplicate-q25` | M4 | Keep `67dd1ccbe41a42083801b230`, move the other copy's history to it (2 users gain it; 4 had both), delete `67c45ba322943ce7acd24d21` |
| 3 `seed-questions` | M2, M4, tags | The 47 seed questions get content, topic ids and misconception tags from `database/questions.json`, matched by code or earlier code (`seedCodeHistory.json`). This includes the content fixes and Q33's stale answer, so there's no separate "fixes before M2" step. |
| 4 `other-questions` | M2 | The 98 others get topic ids from `database/productionTopicMapping.json` (the reviewed proposals) |
| 5 `username-lower` | M5 | 52 of 60 users; the 8 accounts in the 4 collision pairs are skipped and listed by id (M6: the owner resolves them) |
| 6 `user-defaults` | M8 | Missing v2 user fields get their schema defaults |
| 7 `answer-history` | M7 | 994 entries → `useransweredquestions` with `everCorrect: false` and `answeredAt` = migration time; then the array is removed |
| 8 `old-sessions` | M9 | Delete the 247 sessions without a `token` (the backup is the archive) |
| 9 `quizprogresses` | M10 | Drop the collection, only if it's empty |
| 10 `indexes` | M11 | Build every v2 index explicitly (the app would otherwise build them at startup and only log failures) |
| 11 verify | | FAIL checks: answers among options, topic ids, valid tags, no legacy fields or arrays, v2 user fields, no old sessions, every index. WARN checks: users without `usernameLower`, and questions the admin forms would reject (content to fix later). |

**Safety:**
- The connection string comes only from `--uri`; it never reads `.env`.
- Before anything else, it prints the target host, database name, question count and user count.
- It's a dry run by default; `--apply` asks you to type the database name.
- It refuses before any write if it finds data it doesn't expect.
- It uses native-driver writes, with `autoIndex` and `autoCreate` off.
- It prints counts and ids only.

**Implemented with Claude's recommended defaults, confirmed by the owner on 2026-10-01:**
1. **Q25:** keep `67dd1ccbe41a42083801b230` (step 2).
2. **M3:** keep `createdBy`, `createdAt` and `updatedAt`.
3. **M8:** backfill the defaults (step 6).
4. **M10:** drop `quizprogresses` (step 9).
5. **Collisions:** skip the 8 accounts. Until each pair is resolved, the second account of the pair to save anything gets a duplicate-key error, because the model sets `usernameLower` on save. So resolve them before reopening the site.
6. **Content fixes for production-only questions:** deferred to a later reviewed pass. Verification lists the affected questions as WARN, e.g. the duplicated `'Box Magic'` option on `67e2f3bff5addb214fc6a82d`.

### Answer-field problem (M1)

All 146 production questions store the answer as `correctAnswer` (the text, not an index; in 145
of 146 it is one of the options). The new code reads `answer`, so without M1 **no answer on the
live site could ever be scored correct**, and admin edits would fail validation (`answer` is
required).

### 98 unmapped questions and the new topics (M2)

- **Dry run:** `migrateQuestionTopics.js` matched 48 of 146 questions by exact seed code. One
  seed question exists twice. **98 are unmatched**, so `--apply` refuses to run. None of the 98 is
  a whitespace variant of a seed question.
- **Proposals:** per-question proposals, using the Phase 3 concept rule, are in
  `tmp/prodcopy/topic-proposals.md`, with full content in `tmp/prodcopy/unmatched-questions.json`
  (local, gitignored).
  - 31 of the 98 fit existing topics: Functions & Built-ins 21, Names/Mutability/Identity 3,
    Dictionaries 2, Strings 1, Lists 1, Data Types & Conversion 1, Loops & Control Flow 1, and
    Numbers & Arithmetic 1 (its first primary question).
  - 67 need new topics: **Inheritance & MRO 19, Classes & Objects 17, Scope & Namespaces 13,
    Generators & Iterators 11, Exceptions 7.**
- **Owner's decision:**
  - add all five new topics (taxonomy 11 → 16), keeping Inheritance & MRO and Classes & Objects
    **separate** (no OOP merge);
  - map the 31 as proposed;
  - still to do: recompute primary-topic counts for all 146 questions and flag any topic above
    about a third.
- **Stable topic ids (decided after the pause, `docs/CONCEPT_GRAPH.md` §5).** Topics are now
  stored as ids, never display names, so the production migration must **write ids directly**:
  - `migrateQuestionTopics.js` copies `primaryTopic`/`secondaryTopics` from
    `backend/database/questions.json`, which now holds ids, so the 48 matched questions get ids
    with no change to the script;
  - the mappings for the 98 unmatched questions must use ids. `tmp/prodcopy/topic-proposals.md`
    uses display names; convert them when writing the mapping (`mutability`, `loops`, `dicts`,
    `types`, `strings`, `functions`, `sets`, `lists`, `slicing`, `tuples`, `numbers`);
  - the five new topics get the ids proposed in `docs/CONCEPT_GRAPH.md`: `classes` (Classes &
    Objects), `inheritance` (Inheritance & MRO), `scope` (Scope & Namespaces), `generators`
    (Generators & Iterators) and `exceptions` (Exceptions). Add them to
    `backend/config/topicTaxonomy.js` before running M2;
  - `scripts/migrateTopicIds.js` (names → ids) is **not** part of the production runbook.
    Production has never stored `primaryTopic` names; the script exists for databases that were
    migrated with names, i.e. the local dev database, where it has been applied. The old
    `quizsessions` it would also convert are dropped by M9.

### Old `quizsessions` collection (M9)

247 documents from the pre-`d159696` model (`email`, `startTime`, `status`), in the same collection
the new `QuizSession` model uses. They contain email addresses, have no `createdAt` (so they never
expire) and no `token` (so the new unique index on `token` can't be built). The owner decided to
drop the collection, with the mongodump backup serving as the archive.

### Username collisions (M6)

All 60 users lack `usernameLower`. There are 4 case-insensitive collision groups, meaning 4
accounts would be renamed with a numeric suffix. **Owner's decision: rename nothing yet**; the
owner inspects them with this read-only query (not run by Claude, results never shown):

```bash
mongosh --quiet "mongodb://127.0.0.1:27017/pyquiz_prodcopy" --eval '
db.users.aggregate([
  { $sort: { _id: 1 } },
  { $group: { _id: { $toLower: "$username" }, count: { $sum: 1 },
              accounts: { $push: { _id: "$_id", username: "$username" } } } },
  { $match: { count: { $gt: 1 } } },
  { $sort: { _id: 1 } }
]).forEach(printjson)'
```

### Content problems (M4)

Proposed fixes go into `tmp/prodcopy/content-fixes.md` (not written yet) for the owner's review,
then are applied by a script so the same fixes can run on production.
- **Answer not among its options:** `67c45ba322943ce7acd24d29`.
- **Duplicated option text:** `67e2f3bff5addb214fc6a82d` (`'Box Magic'` twice). **Must be fixed
  before the migration.** The question validators now reject duplicate option texts on create and
  update (the answer and misconception tags are matched to an option by its exact text), so this
  question couldn't be edited in the admin panel, and its answer matching is ambiguous. It is the
  only one the earlier survey of the copy listed; the migration's dry run should check all
  questions for duplicate options again.
- **Stated answer wrong:** `67dd83578e2ddadc28e387f6` prints `foo` then `main`, but the answer is
  `main` and no option matches.
- **Ambiguous:** `67e2b4aef5addb214fc6a7e1`: output printed before an error; the dataset is
  inconsistent about this.
- **Wrong or misleading explanations:** about 9, listed per question in `topic-proposals.md`
  (Q68, Q74 copied from Q73, Q96, Q82, Q81, Q27, Q17, Q24, Q55).
- **Error text that depends on the Python version:** 3 (Q66, 3.12; Q61, 3.10; Q43, 3.14).
- **Duplicated seed question:** `67c45ba322943ce7acd24d21` and `67dd1ccbe41a42083801b230`.
  Decision: keep whichever copy the answer history references, and repoint references from the
  other.

**Seed-question fixes (approved, made in `backend/database/questions.json`).** These seed questions
are also in production (48 production questions matched seed questions by code), so the same
fixes must be applied there. Question numbers are positions in the seed file:
- **Q11** (`is` vs `==`): rewritten so its answer doesn't depend on the CPython version. It no
  longer uses `sys.getrefcount` or small-integer caching, only lists and a slice copy. New code,
  options, answer and explanation; secondary topics now `lists`, `slicing`.
- **Q18** (`dict_keys` indexing): the answer no longer quotes a version-specific error message. It
  is now `TypeError (a dict_keys view can't be indexed)`, and the explanation notes that the
  wording differs between versions.
- **Q20** (`removeprefix`/`removesuffix`/`strip`): the answer and three options showed underscores
  as `_ _ _`; they are now as printed (`~~Hello___World~~`). The explanation is corrected:
  `removesuffix('~')` and `removeprefix('~')` remove one tilde each, not all of them.
- **Q23:** typo in an option (`'Java]` → `'Java']`).
- **Q28** (comparisons): the stored answer was wrong, because `set1` had an extra `8`. It is
  removed from `set1` and from the explanation, so the stored answer is now the real output.
- **Q37:** typo in an option (`[['a', 'b', 'c'] d` → `['a', 'b', 'c'] d`).
- **Q8** (`set`): prints `sorted(s)` instead of the set, so the output doesn't depend on set order;
  the answer is now `[1, 3, 4, 5, 7]`, and the explanation is updated.
- **Q28, second fix:** `s2 = s1` instead of a second `'Hello'` literal, so `s2 is s1` is True by
  the language rules, not because CPython shares equal string literals. Same options and answer;
  the explanation is updated.
- **Q42** (`sys.stdout` redirect): starts with `open('log.txt', 'w').close()`, so every run prints
  the same (it used to append to whatever `log.txt` held). The explanation is updated.

Checked: every seed snippet's real output matches its stored answer on CPython 3.9.6 and 3.14.5,
now with `npm run verify-questions`. For production, the 98 questions that aren't seed questions
have never been checked this way. Export them from `pyquiz_prodcopy` to a JSON file in `tmp/` and run
`npm run verify-questions -- --file <that file>` before the content fixes are finalised. The
verifier reads `answer`, and production still stores `correctAnswer` until M1, so map that field in
the export (question content only, no personal data).

**Order matters for Q8, Q11, Q28 and Q42.** `migrateQuestionTopics.js` (M2) matches production
questions to seed entries by their exact `code`, and the seed file now holds the **new** code for
these four. Apply these content fixes to production **before** M2, so their code matches, or M2
reports them as unmatched and refuses to apply. The other fixes don't change `code`. The local dev
database still has the old versions of these nine questions; they are updated together with the Stage 3 tags
(`docs/CONCEPT_GRAPH.md`), by the same dry-run-capable script.

### Misconception tags after migration

Production questions carry no misconception tags. The concept-graph features need no data
migration: `distractors` defaults to empty, and answer events written before the change simply
have no `misconceptionId` or `timedOut`. But misconception data only accumulates for tagged
questions, so **production questions will need tagging after the migration**:
- **The 48 seed questions:** they get the approved tags with the seed content. Match them by code,
  using `backend/database/seedCodeHistory.json` for the snippets whose code was fixed.
  `backend/scripts/syncSeedQuestions.js` does exactly this for local databases. It refuses any
  non-local host, and it overwrites every seed field. So for production, either run it against a
  restored copy as part of the rehearsal, or write a dedicated step for the runbook that sets only
  the approved fields.
- **The 98 non-seed questions:** they need their own proposals, under the same rules
  (`docs/CONCEPT_GRAPH.md` §3: placement, confusions, the tagging rule), reviewed by the owner
  before applying. 67 of them belong to the five planned topics, whose misconceptions
  (`classes.*`, `inheritance.*`, `scope.*`, `generators.*`, `exceptions.*`) have no tagged
  questions yet.
- **Check answers first:** run `npm run verify-questions` on an export of them (see above).

**Found while syncing the local dev database:** four of its questions had a stored answer that
matched none of their options (seed Q8, Q9, Q18 and Q33), so they could never be scored correct.
The seed file was corrected in `274b2d9`, after the dev database was seeded. Production's copies are
probably not affected: the survey found 145 of 146 production answers among their options, and the
one exception is `67c45ba322943ce7acd24d29` (listed under M4). The verify step above would confirm
it.

### autoIndex issue

- **What happened:** the first dry runs loaded the Mongoose models with the default
  `autoIndex: true`, which created indexes on the copy. It created the empty `useransweredquestions`
  collection with its unique `userId+questionId` index, and very likely the `users` indexes
  `usernameLower_1` (unique, sparse) and `stats.totalPoints_-1_stats.bestStreak_-1`. **No
  documents were changed**: document counts and a points fingerprint were identical before and
  after.
- **Consequence:** the same scripts would do this on production.
- **Fix, applied only to the scratch guard so far:** `tmp/prodcopy/guard.js` forces
  `autoIndex: false` and `autoCreate: false`. Of the repository's scripts, only the new
  `migrateTopicIds.js` does this; the migration scripts used in production don't do it yet.

### Requirements for every migration script (owner's decisions)

Dry-run mode (dry run by default), native-driver writes (no Mongoose `$unset`), `autoIndex: false`,
the `127.0.0.1:27017/pyquiz_prodcopy` guard during testing, idempotent re-runs, and the target host
and database printed before each run. Then:
1. one ordered migration runbook script (dry run by default, `--apply` to write);
2. update the deployment checklist in `docs/AUDIT.md` to match;
3. rehearse on a **fresh** `pyquiz_rehearsal` restored from the backup: `--dry-run`, then
   `--apply`, start the backend against it, and smoke-test quizzes, study, the Daily Challenge,
   the dashboard and the leaderboard;
4. stop after each stage; never print personal data; don't push or tag.

### When resuming, in order

1. Get the diffs of the 11 uncommitted server files and re-derive M1–M10 from `9b0d8b4` plus those
   diffs.
2. Decide M3, M8 and M10.
3. Recompute the taxonomy counts for all 146 questions.
4. Move the five planned topics (`PLANNED_TOPICS` in `backend/config/topicTaxonomy.js`, already
   graph nodes) into `TOPICS`, then write the scripts (M1, M2 mappings in ids, M4, M7, M9, and
   M8/M10 if approved). Apply the seed content fixes before M2 (see "Seed-question fixes").
5. Misconception tagging for production questions (see "Misconception tags after migration").
6. Write `content-fixes.md` for review.
7. Build the runbook, update the AUDIT.md checklist, and rehearse.

Local working files (gitignored, question content only, no personal data): `tmp/prodcopy/`
(`guard.js`, `run.sh`, `unmatched-questions.json`, `topic-proposals.md`, `1-topics-dryrun.txt`, and
the read-only survey scripts).

## Rule: scratch files go in `tmp/` inside the repo

Going forward, any throwaway script, intermediate data dump, or one-off transform needed mid-task
(e.g. a script to reshape `questions.json`, a quick verification query) should be written to a
`tmp/` directory at the repository root — not `/tmp`, not the session scratchpad outside the repo.
`tmp/` must be gitignored (add `/tmp/` to the root `.gitignore` if it isn't already there). This
keeps scratch work inspectable within the working tree during a task and trivially excluded from
every commit, rather than scattered across ephemeral system paths that vanish with the session.
Delete a scratch file once its one-off job is done unless there's a reason to keep it.

---

## Remaining instructions, exactly as given in the original task prompt

Everything below this line — the Ground rules (still binding) and Phases 4 through 6 and the Final
report — is copied verbatim from the original task prompt. Nothing has been paraphrased or
summarized.

### Ground rules

- Work on a new git branch named `fix/review-weaknesses`. Commit once per phase with a clear message.
- Before changing anything, run the existing Jest suite and record the baseline (it should be 89 tests across 9 suites). All existing tests must still pass at the end, unless a test encodes behaviour that this task deliberately changes; in that case update the test and say why in the commit message.
- Every behavioural fix must come with at least one new Jest/Supertest test proving it.
- Keep the existing architecture: routes → controllers → services → repositories → models, Zod validation for every new input, and the centralized error handler. Do not introduce a frontend framework or build step. When a backend API changes, update the frontend code that calls it in the same phase.
- Do not change unrelated code, reformat files, or upgrade dependencies unless a fix requires it.
- Wherever this prompt says DECISION, stop, explain the options with their trade-offs and your recommendation, and wait for my answer before implementing.
- Never invent data, measurements, citations, or user-study results. Where documentation needs something only I can provide, insert a clearly marked `TODO(author): ...` placeholder.

### Phase 4: Security

- Session invalidation: add a `tokenVersion` field to User, include it in the JWT, and check it in the auth middleware. Increment it on ban, password change and password reset, so existing sessions stop working immediately. Banned users must also be rejected at login. Add tests for all three cases.
- Admin token: document where it is stored. DECISION: either move admin auth to a separate httpOnly cookie protected by the same CSRF scheme, or keep the Bearer token but store it in sessionStorage with a short expiry and a strict Content-Security-Policy. Explain the XSS-versus-CSRF trade-off.
- CSRF: the app is served from a subdomain of picsartacademy.am, so a sibling subdomain could set a parent-domain cookie and defeat a naive double-submit check. Mitigate by using `__Host-` prefixed cookie names where possible and/or making the CSRF token an HMAC bound to the session. Add a test showing that a mismatched or unbound token is rejected.
- Login-state detection: make sure the frontend can't show a logged-in state after the JWT expires. Align the CSRF cookie's maxAge with the JWT, and/or add a lightweight `GET /api/v1/auth/me` check, and on any 401 clear state and redirect to login.
- Contact form: the auto-reply must not echo any user-supplied content. Add a global daily cap on auto-replies in addition to the per-IP limit, or DECISION: drop the auto-reply entirely.
- Reset tokens: store only a SHA-256 hash, and compare with `crypto.timingSafeEqual`.
- In production, protect /metrics with a bearer token from env or an IP allow-list, and disable /api-docs unless an env flag enables it.
- Configure Express `trust proxy` from an env variable, and document it, so rate limiting uses real client IPs behind the reverse proxy.
- Review the Helmet configuration and add a Content-Security-Policy compatible with the frontend, including the Prism.js CDN.

### Phase 5: Testing and tooling

- Run `jest --coverage`, add coverage reporting to package.json, and write the real line and branch coverage numbers into the documentation.
- Add a small Playwright smoke-test suite for the frontend covering guest quiz flow, login, one Classic quiz, Daily Challenge, and the theme toggle, with a documented npm script. Keep it minimal.
- Add Swagger JSDoc annotations for all public and authenticated endpoints so /api-docs is actually populated.
- Add one-sentence justifications as comments or in the docs for bundling the backend with Webpack and using `tsc --noEmit` (state whether this is JSDoc with checkJs).
- Optional, lower priority: route password-reset and contact emails through the existing BullMQ queue when REDIS_URL is set, falling back to synchronous sending otherwise.
- Add `backend/scripts/benchmark.js` using autocannon against the main endpoints (question fetch, answer submit, leaderboard, dashboard stats), which prints latency percentiles and throughput. Do not put any numbers in the docs unless they come from actually running it.

### Phase 6: Update the system description

Edit docs/PYQUIZ_CURRENT_SYSTEM_DESCRIPTION.md so it matches the code after the fixes:

- Rewrite the answer-integrity claims in Sections 2, 3 and 5 to describe exactly what the server now enforces, without overstating.
- Replace vague descriptions with precise ones: the Daily Challenge seed method, time zone and frozen set; the Blitz timing rules; the Classic exclusion scope; coverage and accuracy definitions; and all threshold values.
- Update the question and topic counts after the taxonomy migration.
- Add a "Requirements" section with numbered functional and non-functional requirements traced to the features.
- Add Mermaid diagrams: system architecture, deployment, an ER diagram of all collections, and a sequence diagram of starting a session and answering a question.
- Add an API endpoint table generated from the actual route files (method, path, auth, CSRF, rate limit, purpose).
- Add a "Testing" section with real test counts and coverage.
- Remove repetition. Explain security mechanisms once, in Section 9, and reference them elsewhere. Say "no AI component" once, in Section 12. Remove self-evaluative sentences from the conclusion, such as the "engineering maturity" line.
- Update Current Limitations and Future Work to reflect what was fixed.
- Add placeholder sections, with TODO(author) markers and no invented content, for: Related Work (a comparison table with columns for Kahoot, Quizlet, W3Schools/Real Python quizzes, LeetCode and HackerRank against PyQuiz features, cells left for me to fill in); Pedagogical Background (retrieval practice / testing effect, gamification in education); and Evaluation (performance results from benchmark.js, plus a user-study section). Also create `docs/evaluation/questionnaire.md` with a draft SUS-style usability questionnaire and a few learning-perception questions I can give to students.

### Final report

When finished, give me:
1. A table of every audited item with its final status and the commit that addressed it.
2. The test count and coverage before and after.
3. Any breaking API changes and how the frontend was updated.
4. Every DECISION and what was chosen.
5. The remaining TODO(author) items I need to complete myself.
