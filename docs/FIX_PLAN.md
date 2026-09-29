# Fix plan — resumption document

Written before a Claude Code restart (update in progress) so the remaining work on the
`fix/review-weaknesses` audit/remediation task can be picked up with no loss of instructions.
Branch: `fix/review-weaknesses`. Current HEAD as of writing: `732d281`.

## Status so far

**Phases 0–3 are complete and committed.** Full detail, evidence, and reasoning for every item
live in `docs/AUDIT.md` — this document does not repeat that content, only indexes it. Baseline
was 89 tests across 9 suites before Phase 1; the suite is now at **128 tests across 15 suites, all
passing**, `npm run lint` and `npm run typecheck` both clean.

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

**Phase 4 (Security) is complete** — see "Phase 4 addendum" in `docs/AUDIT.md`. Suite is now
**156 tests across 18 suites**, lint and typecheck clean. **Next up: Phase 5 (Testing and tooling)**,
verbatim instructions below. Nothing in Phase 5 or 6 has been started.

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

**Phase 4 — security (decisions made in advance by the owner):**
- Admin auth: separate httpOnly cookie (`adminToken` / `__Host-adminToken`) with its own HMAC-bound
  CSRF token; Bearer header no longer accepted; all `localStorage` admin-token use removed.
  Breaking: admin login no longer returns `data.token`.
- CSRF: `__Host-` prefix on session and CSRF cookies in production only (unprefixed, non-Secure
  over plain http in development); CSRF token = HMAC(JWT_SECRET, session JWT). Login and `/me`
  also return `csrfToken` in the body because the API is on a different host from the frontend.
- New `GET /api/v1/auth/me`; frontend login state comes from it, not from cookie presence.
- Contact auto-reply dropped entirely (message still saved, admin still notified).
- `/metrics`: bearer token (`METRICS_TOKEN`) in production, 404 if unset. `/api-docs`: off in
  production unless `ENABLE_API_DOCS=true`.
- Frontend CSP with no `'unsafe-inline'` scripts: inline scripts/handlers moved to external files.

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
  database** — never production; see the deployment checklist in `docs/AUDIT.md`'s "Phase 3
  follow-up" section before ever running `--apply` against production.
- `MIN_ACCURACY_EVENTS`/`MIN_QUESTIONS_FOR_MASTERY` = 3 (named constants,
  `backend/config/masteryConfig.js`); a "measuring" mastery state was added for topics with
  coverage but too few recorded attempts, separate from "unavailable" (too few questions to ever
  measure).

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
