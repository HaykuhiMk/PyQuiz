# Fix plan — resumption document

Resumption document for the `fix/review-weaknesses` audit/remediation task, written so a fresh
session can do the remaining work (Phase 6) without the conversation that produced Phases 0–5.
Branch: `fix/review-weaknesses`. Last updated after the password-trimming fix (2026-09-30).

## Status so far

**Phases 0–5 are complete and committed. Next up: Phase 6 (update the system description),
verbatim instructions below. Nothing in Phase 6 has been started.** Full detail, evidence and
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

- **Tests.** Backend: **223 tests across 28 suites**, all passing (`cd backend && npm test`).
  Frontend: the Playwright suite in `e2e/` has **12 tests**, all passing: 7 smoke tests in
  `smoke.spec.js` plus 5 client/server validation tests in `validation.spec.js`. The baseline before Phase 1 was 89
  tests across 9 suites.
- **Coverage** (`npm run test:coverage`, same config both times):
  - now: **89.67% lines, 74.92% branches** (89.38% statements, 89.76% functions);
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
  - Items in the Phase 5 addendum's "Found while annotating" list that are marked as not
    re-verified.
  - `tsc` doesn't type-check (`checkJs` off).
  - BullMQ email queue not wired up.

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
