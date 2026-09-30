# PyQuiz audit and remediation — Final report

Branch `fix/review-weaknesses`: 31 commits from `d8ad91e` (Phase 0 audit) to `d16e14d`, plus the
commit adding this report. The branch has **not** been merged, and nothing has been deployed. All
migrations and scripts have been run only against the local development database, never against
production.

The full evidence and reasoning for everything below is in `docs/AUDIT.md`, with one addendum per
phase. `docs/FIX_PLAN.md` indexes every decision. The production deployment steps are the "Production
deployment checklist (all phases)" at the end of `docs/AUDIT.md`.

## 1. Audited items: final status and commits

These are the 16 items from the Phase 0 audit (`d8ad91e`). The status column shows what the audit
found; every item is now **fixed**.

| # | Audited item | Phase 0 finding | Final status | Commit(s) |
|---|---|---|---|---|
| 1 | Scoring decided by the client, not the server | Confirmed | **Fixed**: server-side `QuizSession`; the server serves each question and decides correctness, attempts, timing and points | `551a7d4`, `3c0445b` |
| 2 | Quiz mode supplied by the client | Confirmed | **Fixed**: mode is fixed at session start and read from the session; `POST /users/user-progress` removed | `551a7d4` |
| 3 | Repeat-answer points farming | Confirmed | **Fixed**: points only for a first-attempt correct answer, once per question (`everCorrect`) | `551a7d4`, `3c0445b` |
| 4 | Study mode exposure (public, leaked the day's Daily answers) | Confirmed | **Fixed**: Study requires login and excludes today's Daily set. The remaining public answer leak (`POST /questions/:id/check`) was removed later | `9b35735`, `c71a7d4` |
| 5 | Daily Challenge seed, time zone and freezing | Confirmed | **Fixed**: Asia/Yerevan day, secret HMAC-SHA256 seed with mulberry32 and Fisher–Yates, frozen `DailyChallengeSet`, 503 (never a fallback seed) if the secret is missing | `9b35735`, `f38ea66` |
| 6 | `topicStats` counted attempts, not distinct questions | Confirmed | **Fixed**: `topicStats` removed; mastery is computed live (coverage from `UserAnsweredQuestion`, accuracy from `AnswerEvent`). A lost-increment bug found by a new test was also fixed | `3c0445b`, `442ca04`, `120e5ae` |
| 7 | Orphaned data on question delete/retag and account deletion | Partially | **Fixed**: question deletion cascades to `UserAnsweredQuestion`; retagging can't drift (live mastery); account deletion now removes all user-linked records | `442ca04`, `c12a630` |
| 8 | Classic exclusion was client-side and per request | Confirmed | **Fixed**: the server excludes first-attempt-correct questions only; "Practice again (no points)" when the pool is exhausted | `551a7d4`, `442ca04` |
| 9 | Username uniqueness, avatar projection, leaderboard row identification | Confirmed | **Fixed**: case-insensitive unique username (`usernameLower`), avatar excluded from reads by default, server-computed `isCurrentUser` | `442ca04` |
| 10 | No token invalidation on ban, password change or reset | Confirmed | **Fixed**: `tokenVersion` in every JWT, checked on every request and bumped on all three | `98b06d7` |
| 11 | Admin token in `localStorage` | Confirmed | **Fixed**: separate httpOnly admin cookie with admin-bound CSRF; Bearer header no longer accepted | `98b06d7` |
| 12 | CSRF cookie vs JWT cookie (no `__Host-`/HMAC), login-state detection | Partially | **Fixed**: `__Host-` cookies in production, HMAC-bound CSRF token, `GET /auth/me` for login state. Also CORS tests and a landing-page race fix | `98b06d7`, `efe859c`, `2ca18a0` |
| 13 | Contact auto-reply echoed content, with no global cap | Confirmed | **Fixed**: auto-reply dropped; message stored and sent to the admin only | `98b06d7` |
| 14 | Reset tokens stored in plain text | Confirmed | **Fixed**: only a SHA-256 hash stored, compared in constant time | `98b06d7` |
| 15 | `/metrics` and `/api-docs` public; no `trust proxy` | Confirmed | **Fixed**: `TRUST_PROXY` hop count (warning on `true`), limiters keyed by user/IP, `/metrics` bearer token and `/api-docs` flag in production | `f38ea66`, `120e5ae`, `98b06d7` |
| 16 | 92 free-text tags on 47 questions, 64 used once | Confirmed | **Fixed**: 11 canonical topics, one required primary topic plus optional secondary topics, migration refuses a partially mappable database | `39aa508`, `732d281` |

### 1.1 Additional issues found and fixed during the work

These were not among the 16 audit items. They were found by tests, by the documentation pass, or by
review, and fixed on the same branch.

| Issue | Commit |
|---|---|
| `MONGO_URI`/`MONGODB_URI` used inconsistently; now `MONGODB_URI` everywhere, with a `MONGO_URI` fallback and warning | `13fce23` |
| About page question count broken since Phase 2; new aggregate-only `GET /questions/stats` | `1d379b4` |
| Avatar route rejected real photos with a bare 413; now a route-specific 1 MB limit and a readable error | `93dafed` |
| Change-password used a stricter password rule than registration | `c6eb877` |
| Admin login revealed which usernames exist (404 vs 401) | `576b69b` |
| Password rule duplicated (and drifted) in three frontend pages; now defined once and served by `GET /validation-rules` | `e32468e` |
| Landing-page buttons dead until the `/auth/me` check answered (Phase 4 regression) | `2ca18a0` |
| Avatar picker limit (500 KB) above the server's real limit (374,982 bytes) | `0942d13` |
| User login timing revealed whether an email is registered | `36f0ae3` |
| Registration/login trimmed passwords while reset/change-password did not | `9486d78` |
| Account deletion left `AnswerEvent`, `QuizSession` and reset-key records behind | `c12a630` |
| Dashboard used "Accuracy" for two different measures | `d16e14d` |

## 2. Test counts and coverage, before and after

"Before" is the Phase 0 commit `d8ad91e`, before any fix. Coverage for both columns was measured
with the same configuration, covering all runtime backend code except the one-off `scripts/` and
`database/` tools.

| | Before (`d8ad91e`) | After (`d16e14d`) |
|---|---|---|
| Backend tests (Jest + Supertest) | 89 tests, 9 suites | **224 tests, 29 suites**, all passing |
| Browser tests (Playwright, `e2e/`) | none | **13 tests**, all passing (7 smoke, 5 validation, 1 dashboard) |
| Line coverage | 77.69% (763/982) | **89.72%** (1318/1469) |
| Branch coverage | 50.39% (191/379) | **74.92%** (487/650) |
| Statement coverage | 77.19% (775/1004) | **89.42%** (1345/1504) |
| Function coverage | 72.57% (127/175) | **89.88%** (231/257) |
| `npm run lint` | — | clean |
| `npm run typecheck` | — | passes, but it is a syntax check only (`checkJs` off), not type checking |

The before/after numbers were measured by this work. `npm run test:coverage` reproduces the
"after" column.

## 3. Breaking API changes and how the frontend was updated

In every case, the frontend was updated in the same commit.

| # | Change | Commit | Frontend update |
|---|---|---|---|
| 1 | `POST /api/v1/users/user-progress` removed. Scoring happens only through the new `POST /api/v1/quiz/sessions`, `/:sessionId/next`, `/:sessionId/answer` and `/:sessionId/reveal` | `551a7d4` | `api.js` and `questions.js` switched to the session endpoints |
| 2 | Answer responses: `alreadyMastered` replaced by `pointsWithheldReason` (`not_first_attempt`, `already_mastered` or `null`); the public `sessionId` became a random token instead of the database id | `3c0445b` | `questions.js` shows the right message for a 0-point correct answer; the token is opaque to the client, so nothing else changed |
| 3 | `GET /api/v1/questions/study` requires login (401 for guests) and excludes today's Daily questions; `GET /challenges/daily` adds `nextResetAt` | `9b35735` | `study.js` requires login; `daily.js` and `daily.html` show the reset countdown |
| 4 | Question `topics` replaced by `primaryTopic` (required, canonical) and `secondaryTopics`, in responses and in admin create/update payloads | `39aa508` | `admin_dashboard.js`, `manage-questions.js`, `questions.js`, `study.js`, `daily.js`, the new `topicTaxonomy.js` and the admin/quiz views |
| 5 | Admin authentication moved to its own cookie:<br>• `POST /admin/login` no longer returns `data.token`, and admin routes no longer accept `Authorization: Bearer`<br>• state-changing admin routes (including `POST /questions/add`) require the admin CSRF token<br>• new `POST /admin/logout` and `GET /admin/me` | `98b06d7` | `api.js` and every admin page (`admin_login.js`, `admin_dashboard.js`, `manage-questions.js`, `users.js`, `contacts.js`, new `admin_entry.js`); all `localStorage` token use removed |
| 6 | Session and CSRF behaviour:<br>• CSRF token HMAC-bound to the session<br>• in production, cookies renamed `__Host-token`, `__Host-csrfToken`, `__Host-adminToken` and `__Host-adminCsrfToken`<br>• login and `/me` return `csrfToken` in the body<br>• new `GET /auth/me`<br>• a password change invalidates the current session too | `98b06d7` | `api.js` takes the CSRF token from login or `/me` and redirects on 401; `header_logic.js`, `load_sidebar.js`, `index.js` and `questions.js` use `/auth/me`; `settings.js` logs out after a password change |
| 7 | Contact form sends no auto-reply to the submitter | `98b06d7` | none needed (the response shape is unchanged) |
| 8 | Production only: `/metrics` needs `Authorization: Bearer $METRICS_TOKEN` (404 if unset), and `/api-docs` is off unless `ENABLE_API_DOCS=true` | `98b06d7` | none (not used by the frontend) |
| 9 | `POST /api/v1/questions/:id/check` removed (404) | `c71a7d4` | the unused `api.checkAnswer` helper removed |
| 10 | `POST /admin/login` answers an unknown or non-admin username with 401 "Invalid credentials" (previously 404 "Admin not found") | `576b69b` | none needed (the admin login page already shows the returned message) |

**Additive changes (not breaking):**
- `canPracticeAgain` / `practiceMode`, and `isCurrentUser` on leaderboard rows (`442ca04`);
- `GET /questions/stats` (`1d379b4`);
- `GET /validation-rules` (`e32468e`).

**Deployment-level effects:** a one-time logout of every user and admin (new cookie names), and
invalidated outstanding reset links. The deployment checklist lists both.

## 4. Every DECISION and what was chosen

"Owner" means the project owner decided, either when asked at a DECISION point or in advance in the
task instructions. "Implementation" means the choice was made during the work and reported; it
wasn't specified in the instructions.

### Phase 1 — server-authoritative quiz sessions

| Decision | Chosen | By |
|---|---|---|
| DECISION 1: Blitz pause on a wrong answer | No pause; the deadline is fixed server-side when the question is served and never extended | Owner |
| DECISION 2: points across sessions | First-attempt-correct only, once per question ever; repeats and attempt-2/3 answers earn 0 but still count toward accuracy | Owner (narrowed to "first attempt" in the follow-ups) |
| DECISION 3: points already farmed | Left untouched; `backend/scripts/resetFarmedPoints.js` written (dry-run by default) but **never run** | Owner |
| DECISION 4: guest `AnswerEvent`s | Not recorded (no durable identity) | Owner |
| Shared 3-attempt cap in Classic and Blitz | Kept deliberately, to stop brute-forcing options within the Blitz deadline | Owner (confirmed in the follow-ups) |

### Phase 2 — Study mode and Daily Challenge

| Decision | Chosen | By |
|---|---|---|
| Study mode access | Login required; today's Daily set excluded | Owner |
| Daily Challenge day boundary | Asia/Yerevan (not UTC); next reset shown on the page | Owner |
| Daily Challenge seed | HMAC-SHA256(secret, date) → mulberry32 → Fisher–Yates; the set is frozen per day | Owner (in advance) |
| Daily answers as evidence | Count toward streaks, accuracy and mastery like quiz answers; the flat 20-point bonus is paid separately | Owner |
| Missing seed secret | Startup warning; 503 only when a new day's set is needed; no fallback seed | Owner |

### Phase 3 — data consistency, statistics and taxonomy

| Decision | Chosen | By |
|---|---|---|
| Topic mastery source | Computed live from `UserAnsweredQuestion` and `AnswerEvent` (chosen over a recompute script) | Owner |
| Classic exclusion scope | Only first-attempt-correct (`everCorrect`) questions; "Practice again (no points)" and "Widen filters" when the pool is exhausted | Owner |
| Case-insensitive usernames | Enforced (`usernameLower`, unique); backfill and duplicate-report scripts written, not run on real data | Owner |
| General `/api` limiter | Keyed by user (300/15 min) and by guest IP (1000/15 min) | Owner |
| `TRUST_PROXY` | Exact hop count; startup warning if set to `true` | Owner |
| Thin-attempt accuracy | A "measuring" level below 3 attempts (`MIN_ACCURACY_EVENTS = 3`) | Owner |
| Taxonomy | 11 canonical topics; one required primary plus optional secondary; filters match either; mastery uses the primary only | Owner |
| Thin and empty topics | Keep all 11 (no merging); hide zero-question topics; "Not enough questions yet" below 3 questions; a "Content gaps" section in AUDIT.md | Owner |

### Phase 4 — security

| Decision | Chosen | By |
|---|---|---|
| Admin authentication | Separate httpOnly cookie with the same (HMAC) CSRF scheme; all `localStorage` use removed | Owner (in advance) |
| CSRF | `__Host-` prefix in production, HMAC bound to the session; plain http keeps working in development | Owner (in advance) |
| Contact auto-reply | Dropped entirely; message still stored and sent to the admin | Owner (in advance) |
| `/metrics` and `/api-docs` | Bearer token from env in production; `/api-docs` off unless `ENABLE_API_DOCS=true` | Owner (in advance) |
| Content-Security-Policy | Inline scripts and handlers moved to external files; no `'unsafe-inline'` for scripts | Owner (in advance) |
| CSRF token in the response body | Returned by login and `/me`, because the API is on a different host from the frontend | Implementation |
| `MONGO_URI` → `MONGODB_URI` | Read `MONGODB_URI`, fall back to `MONGO_URI` with a startup warning | Owner |

### Phase 5 — testing and tooling

| Decision | Chosen | By |
|---|---|---|
| Coverage | Real line and branch coverage over all runtime code | Owner (in advance) |
| Playwright | A minimal smoke suite, including the About page and login/logout | Owner (in advance) |
| Swagger | Annotate every endpoint; a test keeps the spec in sync with the routes | Owner (in advance) |
| BullMQ email queue | Skipped; documented as future work | Owner (in advance) |
| Benchmark target | Localhost by default, anything else only via an explicit `--url`; one local run recorded | Owner (in advance) |
| Benchmark rate limits | `BENCHMARK_DISABLE_RATE_LIMITS`, honoured only outside production | Implementation |

### Follow-ups

| Decision | Chosen | By |
|---|---|---|
| Public `POST /questions/:id/check` | Removed, since nothing used it | Owner |
| Avatar body limit | 1 MB on the profile route only | Owner |
| Password rule | One definition, served to the frontend by `GET /validation-rules` | Owner |
| Avatar picker limit | The real maximum after base64, 374,982 bytes (366 KB), checked before upload | Owner |
| Login errors and timing (user and admin) | One generic error, equal bcrypt work | Owner |
| Password trimming | Never trimmed, anywhere | Owner |
| Account deletion scope | User plus `UserAnsweredQuestion`, `AnswerEvent`, `QuizSession` and pending reset keys; contact messages kept | Owner (contact messages kept: implementation) |
| Dashboard accuracy labels | "Questions answered correctly" and "Attempts correct", with visible help text rather than hover-only tooltips | Owner (visible help text: implementation) |
| System description | Title unchanged, with a TODO(author) note; design decisions, test-caught bugs and honest limitations added | Owner |

## 5. Remaining TODO(author) items

These are every `TODO(author)` marker in the repository, excluding the rule text in `CLAUDE.md` and
the instructions in `FIX_PLAN.md`. Line numbers are as of `d16e14d`.

**`docs/PYQUIZ_CURRENT_SYSTEM_DESCRIPTION.md`**

| Line | What is needed |
|---|---|
| 3 | Final thesis title (the document title was deliberately not changed) |
| 126 | NFR-9: no automated accessibility test exists; add one or qualify the requirement |
| 127 | NFR-10: define a performance target, if the thesis needs one |
| 581 | Deployment diagram: the reverse proxy / TLS product and hop count |
| 585 | Deployment diagram: MongoDB hosting and region |
| 593 | §8.1: the actual hosting environment (provider, server or container setup, reverse proxy, process manager, whether Redis is used in production) |
| 992 | §14: no automated accessibility audit (axe or Lighthouse); add one if the thesis makes claims beyond the listed practices |
| 1000 | §15 Related Work: write the section |
| 1006–1015 | §15 comparison table: every cell for Kahoot, Quizlet, W3Schools/Real Python quizzes, LeetCode and HackerRank, plus PyQuiz's "Free to use" |
| 1019 | §16 Pedagogical Background: write it with cited sources |
| 1024 | §16.1: retrieval practice and the testing effect, with citations |
| 1029 | §16.2: gamification in education, with citations |
| 1046 | §17: any learning-outcome claim needs the user study |
| 1078 | §18.1: production-like benchmark numbers, if needed |
| 1083 | §18.2 User study: participants, procedure, questionnaire as administered, results (SUS score), discussion |

**`docs/evaluation/questionnaire.md`**

| Line | What is needed |
|---|---|
| 4 | Review every item, choose the final set, and obtain any institutional approval |
| 9 | Study purpose, consent and anonymisation statement, participant tasks, time needed |
| 32 | Check the SUS item wording against the original source and add the citation |
| 84 | Before the study: sample size and recruitment, the analysis plan for Part C, how open answers are coded, and a note that perception is not a learning measure |

### 5.1 Owner actions that are not TODO markers

- **Production deployment.** Follow the checklist at the end of `docs/AUDIT.md`: HTTPS; the env
  variables (`MONGODB_URI`, `JWT_SECRET`, `DAILY_CHALLENGE_SEED_SECRET`, `TRUST_PROXY`,
  `METRICS_TOKEN`, `CLIENT_URI`, email); a backup; the username backfill and duplicate check; the
  topic-migration dry run and apply; deploying backend and frontend together with cache-busting;
  and the smoke test. None of these has been run against production.
- **`resetFarmedPoints.js`.** Decide whether to run it (DECISION 3 left it unrun).
- **Unverified findings.** These are listed in §19 of the system description and the Phase 5
  addendum of `docs/AUDIT.md`: `verifyAdmin` 403 vs 401, error-envelope consistency, the user
  Bearer header versus CSRF, the double optional-auth pass, validators outside `validators/`, and
  the unvalidated leaderboard `limit`. They need re-verifying and, if confirmed, fixing.
- **Known limitations kept deliberately.** `tsc` with `checkJs` off (1,564 errors if enabled), and
  the unwired BullMQ email queue.
- **Content gaps.** Add questions for Numbers & Arithmetic (0), Tuples (1) and Indexing & Slicing
  (2), with a target of at least 3 primary questions each.
- **Merge.** Review and merge `fix/review-weaknesses` into `main`; this report does not do it.
