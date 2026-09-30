# PyQuiz audit and remediation — Final report

Branch `fix/review-weaknesses`: 41 commits from `d8ad91e` (Phase 0 audit) to `da72857`, plus the
documentation commit that brings this report up to date. The branch has **not** been merged, and nothing has been deployed. All
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

The findings reported (unverified) by the Phase 5 annotation pass were re-verified against the code
with live requests. Five were confirmed and fixed; the contact-form half of the fifth was not an
issue.

| Verified finding | Result | Commit |
|---|---|---|
| `verifyAdmin` answered a missing cookie with 403 but an invalid token with 401, so an admin whose session ended mid-page wasn't redirected | **Fixed**: 401 for no valid session, 403 only for a valid non-admin session; admin pages redirect on 401 mid-page | `bf930af` |
| Three error shapes (the central envelope, `{ error }` from the auth middleware and route limiters, plain text from the general limiter), so the page showed "Request failed (429)" | **Fixed**: every error response, including all four limiters and `/metrics`/`/readyz`, uses the central envelope; the page shows the real message | `3c09044` |
| User auth also accepted `Authorization: Bearer`, which the CSRF checks ignored; `/auth/me` issued the same CSRF token (from an empty string) to every Bearer-only caller | **Fixed**: cookie-only authentication; no CSRF token can be computed without a real session; `Authorization` is no longer a CORS-allowed header | `1994baf` |
| Double user lookup: quiz routes and the leaderboard mounted `optionalAuthenticate` again, and authenticated routes added a second check | **Fixed** (it was broader than reported): the session is resolved once per request and reused; exactly one lookup per request, tested | `8432a3d` |
| Validation outside `validators/` | Daily Challenge submission schema **moved** into `validators/`. Contact form: **not an issue** (its schema is already there; it is applied in the service on purpose so the honeypot runs first) | `4fa9563` |
| Leaderboard `limit` had no Zod schema (clamped or silently replaced) | **Fixed**: Zod, 1–100, else 400, like `paginationQuerySchema`; the unvalidated admin `:id` path parameters are validated too | `3f0ec00` |

## 2. Test counts and coverage, before and after

"Before" is the Phase 0 commit `d8ad91e`, before any fix. Coverage for both columns was measured
with the same configuration, covering all runtime backend code except the one-off `scripts/` and
`database/` tools.

| | Before (`d8ad91e`) | After (`3f0ec00`) |
|---|---|---|
| Backend tests (Jest + Supertest) | 89 tests, 9 suites | **265 tests, 33 suites**, all passing |
| Browser tests (Playwright, `e2e/`) | none | **16 tests**, all passing (7 smoke, 5 validation, 1 dashboard, 1 admin session, 2 error messages) |
| Line coverage | 77.69% (763/982) | **90.17%** (1340/1486) |
| Branch coverage | 50.39% (191/379) | **76.15%** (495/650) |
| Statement coverage | 77.19% (775/1004) | **89.87%** (1367/1521) |
| Function coverage | 72.57% (127/175) | **90.80%** (237/261) |
| `npm run lint` | — | clean |
| `npm run typecheck` | — | passes, but it is a syntax check only (`checkJs` off), not type checking |

The before/after numbers were measured by this work. `npm run test:coverage` reproduces the
"after" column.

**Intermittent test failures: stress-tested.** The full backend suite was run 20 times in a row
(logs in `tmp/stress/`, gitignored).
- **Result:** 17 runs passed and 3 failed, each on a different test. The "Scoring by attempt" test
  that failed once earlier passed all 20 times. Its code path doesn't depend on timestamp
  ordering, wall-clock time or deadlines, and no leftover state from other tests was found, so its
  one earlier failure remains unexplained.
- **Rate-limit tests (fixed, `da72857`):** the "general /api rate limiter" test timed out twice, on
  Jest's 5 s default. It and the quiz-session limiter test exhaust real limits by sending hundreds
  or tens of requests: 2.4 s and 1.3 s on an idle machine, 5–12.5 s under CPU load. Under load they
  failed reproducibly, so they now have an explicit 30 s timeout. It's a test-only change; under
  the same load they then passed every run.
- **`passwordPolicy.test.js` timeout (not changed):** it happened during an 11-minute freeze of the
  whole test process (no log output for 666 s), most likely the machine sleeping. The test
  normally takes 0.6–1.1 s.
- **`rejects limit= with 400` (not changed; cause unknown):** the test received a 400 with no JSON
  body, and the request never appeared in the app's request log, so it didn't reach Express. The
  test normally takes about 15 ms and didn't fail under load.

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
| 11 | Admin routes answer a missing, malformed, expired or revoked admin session with **401** (a missing cookie was 403); 403 now means a valid session that isn't an admin, including a demoted admin (was 401) | `bf930af` | none needed: `api.js` already sends any admin-scope 401 to the admin login, which now also happens mid-page (Playwright `admin.spec.js`) |
| 12 | Authentication and rate-limit errors now use the central envelope `{ success: false, data: null, error: { message, details }, meta }` instead of `{ error: "…" }` or, for the general limiter, plain text. Message texts changed (e.g. "Unauthorized. No token provided." → "Authentication required."). `/metrics` 401/404 now have a JSON body, and the `/readyz` 503 body moved into `error.details` | `3c09044` | none needed: `api.js` already read `error.message`, so pages now show the real message for 429s (Playwright `errors.spec.js`) |
| 13 | User authentication no longer accepts `Authorization: Bearer`, and `Authorization` is no longer a CORS-allowed request header | `1994baf` | none needed (the frontend never sent it) |
| 14 | `GET /users/leaderboard?limit=` outside 1–100, or non-integer, now gets **400** (was silently clamped or replaced by 50). A malformed admin `:id` now gets 400 "Validation failed" (was 400 "Invalid identifier.") | `3f0ec00` | none needed (the leaderboard page always sends `limit=50`; admin pages send real ids) |
| 15 | Stable topic ids (after the audit, branch `feature/concept-graph`, `docs/CONCEPT_GRAPH.md` §5). Topics are stored and passed by id (`mutability`, `lists`, …), never by display name:<br>• `primaryTopic`/`secondaryTopics` in question responses and admin create/update payloads, `?topics=` on `/questions`, `/questions/study`, `/questions/random` and `/admin/questions`, the `topics` body field of `POST /quiz/sessions`, and `topic` in `GET /users/topic-mastery` are ids; a display name now gets **400**<br>• `GET /questions/topics` returns `[{ id, name }]` sorted by name (was an array of name strings)<br>• new `GET /api/v1/topics` returns the full taxonomy as `[{ id, name }]`<br>• fixes the comma bug: "Names, Mutability & Identity" was split on its comma by `?topics=`, so filtering by it failed with 400 | stable-id commit | `topicTaxonomy.js` removed; new `topics.js` loads names from `GET /api/v1/topics`. `questions.js`, `study.js`, `admin_dashboard.js`, `manage-questions.js`, `daily.js` and `account.js` send ids and show names (Playwright `topics.spec.js`). Existing data: `scripts/migrateTopicIds.js` (local dev database) |

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

### Verified-findings round

| Decision | Chosen | By |
|---|---|---|
| Admin auth status codes | 401 for no valid session (missing, malformed, expired, revoked, banned or deleted); 403 only for a valid non-admin session | Owner |
| Error shape | One central envelope for every error, including all rate limiters and the auth middleware | Owner |
| `/metrics` and `/readyz` errors | Also moved to the envelope; the `/readyz` 200 body is unchanged | Implementation |
| User Bearer tokens | Removed entirely; cookie-only authentication; no CSRF token without a real session | Owner |
| `Authorization` CORS header | Removed from the allowed request headers | Implementation |
| Duplicate user lookups | One memoized session check per request, shared by `optionalAuthenticate` and `authenticateToken` (rather than only deleting the duplicate mounts) | Owner (memoization: implementation) |
| Daily Challenge submission schema | Moved into `validators/challengeValidators.js` | Owner |
| Leaderboard `limit` and admin `:id` | Zod-validated, 400 on invalid input | Owner |
| Quiz `:sessionId` | Kept as a uniform 404 for malformed, unknown or other users' session tokens (a deliberate Phase 1 design), not changed to 400 | Owner (proposed during implementation, then confirmed) |
| e2e harness | Seeds one admin account; sets `EMAIL_USER`/`EMAIL_PASS` empty so a run never sends real email | Implementation |

## 5. Remaining TODO(author) items

These are every `TODO(author)` marker in the repository, excluding the rule text in `CLAUDE.md` and
the instructions in `FIX_PLAN.md`. Line numbers are as of the commit that brings this report up
to date.

**`docs/PYQUIZ_CURRENT_SYSTEM_DESCRIPTION.md`**

| Line | What is needed |
|---|---|
| 3 | Final thesis title (the document title was deliberately not changed) |
| 126 | NFR-9: no automated accessibility test exists; add one or qualify the requirement |
| 127 | NFR-10: define a performance target, if the thesis needs one |
| 583 | Deployment diagram: the reverse proxy / TLS product and hop count |
| 587 | Deployment diagram: MongoDB hosting and region |
| 595 | §8.1: the actual hosting environment (provider, server or container setup, reverse proxy, process manager, whether Redis is used in production) |
| 1025 | §14: no automated accessibility audit (axe or Lighthouse); add one if the thesis makes claims beyond the listed practices |
| 1033 | §15 Related Work: write the section |
| 1039–1048 | §15 comparison table: every cell for Kahoot, Quizlet, W3Schools/Real Python quizzes, LeetCode and HackerRank, plus PyQuiz's "Free to use" |
| 1052 | §16 Pedagogical Background: write it with cited sources |
| 1057 | §16.1: retrieval practice and the testing effect, with citations |
| 1062 | §16.2: gamification in education, with citations |
| 1079 | §17: any learning-outcome claim needs the user study |
| 1111 | §18.1: production-like benchmark numbers, if needed |
| 1116 | §18.2 User study: participants, procedure, questionnaire as administered, results (SUS score), discussion |

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
- **Known limitations kept deliberately.** `tsc` with `checkJs` off (1,564 errors if enabled), and
  the unwired BullMQ email queue.
- **Content gaps.** Add questions for Numbers & Arithmetic (0), Tuples (1) and Indexing & Slicing
  (2), with a target of at least 3 primary questions each.
- **Merge.** Review and merge `fix/review-weaknesses` into `main`; this report does not do it.
