# PyQuiz — Phase 0 Audit

This document records the verification of 16 suspected weaknesses in the current PyQuiz
implementation, found by reviewing `docs/PYQUIZ_CURRENT_SYSTEM_DESCRIPTION.md` against the
actual backend/frontend code. Each item lists a status, the file/line evidence used to reach
it, and a one-sentence plan for the phase that will address it. No code was changed to produce
this document.

Status legend: **CONFIRMED** (the weakness exists as described), **NOT AN ISSUE** (checked and
the code already handles it correctly), **PARTIALLY** (real but narrower/different than
suspected, or a mix of confirmed and non-issue sub-parts).

---

## 1. Server-authoritative quiz sessions

**Status: CONFIRMED.**

There is no session/attempt-tracking model at all: `backend/models/` contains only
`contact.js`, `questionModel.js`, `resetPassword.js`, `user.js`, `userAnsweredQuestion.js` — no
`QuizSession` or equivalent. `POST /api/v1/user/progress` (`backend/routes/v1/userRoutes.js`,
handled by `updateUserProgress` in `backend/services/userService.js:99-172`) takes a single
question/answer pair with no concept of a run, mode-scoped attempt count, or deadline. All
mode/attempt/timer logic (attempt caps, Survival's end-on-mistake, Blitz's 45s countdown and
time bonus) lives client-side in `frontend/public/js/questions.js`. Plan: Phase 1 adds a
`QuizSession` model and moves this enforcement server-side.

## 2. Quiz mode supplied by the client

**Status: CONFIRMED.**

`updateProgressSchema` in `backend/validators/userValidators.js:11` accepts
`mode: z.enum(['classic','blitz','survival']).optional().default('classic')` directly from the
request body, and `updateUserProgress` destructures it unchanged from `payload`
(`backend/services/userService.js:105`) to compute points via `computePoints`
(`userService.js:18-30`), which pays more for `survival`/`blitz`. A client can claim any mode
regardless of what was actually played. Plan: Phase 1 takes mode from the server-side session
only, never the answer request.

## 3. Repeat-answer points farming

**Status: CONFIRMED.**

`markAnswered` (`backend/repositories/userAnsweredQuestionRepository.js:3-9`) is an upsert with
`$setOnInsert`, so it silently no-ops on a duplicate `(userId, questionId)` — but
`updateUserProgress` calls it and then unconditionally runs the full scoring path
(`userService.js:124-160`) regardless of whether the upsert inserted or matched an existing
document. There is no check anywhere for "already answered" before awarding points/stats.
Answering the same question again, in the same or a later run, awards points again every time.
Plan: Phase 1 caps points to once per question per session and Phase 1's DECISION will settle
cross-session repeat-answer policy.

## 4. Study mode exposure

**Status: CONFIRMED (both halves).**

`GET /api/v1/questions/study` (`backend/routes/v1/questionRoutes.js:16`) has no
`authenticateToken` in its middleware chain — it is fully public. Its handler
(`getStudyQuestions`, `backend/controllers/questionController.js:58-71`) calls
`studyService.getStudyQuestions` (`backend/services/studyService.js:3-24`), which returns
`answer` and `explanation` for every question (lines 16-20) unconditionally. It also draws from
the same unfiltered `Question` collection as the Daily Challenge
(`questionService.getQuestionsForStudy` → `findQuestionPage`, `questionService.js:36-51,61-63`,
vs. `dailyChallengeService.getDailyQuestions`, `dailyChallengeService.js:24-31`, which also
`Question.find()`s the whole collection) — nothing marks or excludes today's 5 daily-challenge
questions from Study, so an anonymous user can look up today's Daily Challenge answers via Study
mode. Plan: Phase 2 DECISION on requiring auth for Study, and excluding the frozen daily set.

## 5. Daily Challenge seed/timezone/freezing

**Status: CONFIRMED.**

`getTodayKey()` (`backend/services/dailyChallengeService.js:8-10`) uses
`new Date().toISOString().slice(0,10)` — UTC, not configurable. `seededShuffle`
(lines 12-22) is a chained-SHA-256 Fisher–Yates keyed by `pyquiz-daily-${dateKey}`, not an
HMAC. Nothing persists the resulting set: `getDailyQuestions` (lines 24-31) calls
`Question.find()` fresh and reshuffles on every single request, and `submitDailyChallenge`
(lines 60-103) re-fetches it again independently at submission time. Because the shuffle
input is the live, full question array, adding or deleting any question changes the indices
that Fisher–Yates walks, which changes the selected 5 questions for a day already in progress —
including questions a user already saw before the edit. Plan: Phase 2 switches to an
HMAC-SHA256 seed, persists a `DailyChallengeSet` document per day, and adds a DECISION on the
challenge-day timezone.

## 6. `topicStats` semantics

**Status: CONFIRMED — counts attempts, not distinct questions.**

In `updateUserProgress` (`backend/services/userService.js:149-160`), each submission
increments `entry.attempted` by 1 and `entry.correct` if correct, for every topic on the
question, on every call — with no dedupe against `UserAnsweredQuestion`. `stats.totalAnswered`
is incremented the same way at line 126. A wrong-then-right Classic answer (two separate
`POST /progress` calls, since there's no session to hold client-side attempt state
server-side) is therefore recorded as `attempted: 2, correct: 1` for every topic on that
question, and `totalAnswered` increases by 2, even though only one question was "answered."
Plan: Phase 3 defines `questionsAnswered`/`questionsCorrect`/`attempts`/`correctAttempts`
explicitly and documents which one coverage/accuracy use.

## 7. Orphaned data on question delete/retag and account deletion

**Status: PARTIALLY.**

- Question delete: `deleteQuestion` (`backend/services/questionService.js:130-133`) calls only
  `questionRepository.deleteQuestionById` — CONFIRMED no cascade to `UserAnsweredQuestion` or
  `User.topicStats`. Deleting a question a user already answered leaves a dangling
  `UserAnsweredQuestion` row (inflating "answered" counts past what still exists) and leaves
  `topicStats` entries unaffected (they're aggregate counters, not per-question, so they don't
  break, but they can no longer be reconciled against the live question set).
- Retag: `updateQuestion` (`questionService.js:113-128`) only writes the new `topics` field on
  the `Question` document — CONFIRMED it never touches existing `User.topicStats` entries keyed
  by the old topic name, so old-topic stats become orphaned/stale after a retag.
- Account deletion: `deleteAccount` (`backend/services/userService.js:247-265`) DOES cascade —
  it deletes the `User` document and calls
  `userAnsweredQuestionRepository.deleteAllForUser(userId)` (line 263). **NOT AN ISSUE** for
  this sub-part.

Plan: Phase 3 makes deletion/retagging consistent (cascade-delete or compute coverage against
existing questions only; recompute or document topicStats drift on retag).

## 8. Classic exclusion scope and pool exhaustion

**Status: CONFIRMED — exclusion is client-supplied and per-request, not server-persisted.**

`getRandomQuestion` (`backend/controllers/questionController.js:29-37`) reads `excludeIds`
straight from `req.query` and passes it through
(`randomQuestionFilterSchema`, `backend/validators/questionValidators.js:55-59`, caps it at 500
ids but does not source it from anywhere server-side). The actual exclusion list is built in
the frontend (`frontend/public/js/questions.js:220-228`): only applied
`!isGuest && quizMode === "classic"`, built from the client's own in-memory
`answeredQuestions` array. A logged-in user's client fully controls what's excluded; a guest
gets no exclusion at all. When the pool is exhausted, `questionService.getRandomQuestion`
(`backend/services/questionService.js:65-86`) returns
`{ noMoreQuestions: true, message: 'No questions found for selected filters.', totalAnswered }`
rather than crashing, but this is a bare flag/message, not a "reset progress or widen filters"
offer. Plan: Phase 3 makes exclusion scope explicit and improves the exhausted-pool UX.

## 9. Username uniqueness, avatar projection, leaderboard row identification

**Status: CONFIRMED (all three sub-parts).**

- `backend/models/user.js:5`: `username: { type: String, required: true }` — no `unique` or
  index, unlike `email` (line 7, `unique: true`). Usernames are NOT enforced unique.
- `findLeaderboard` (`backend/repositories/userRepository.js:48-54`) already excludes avatar via
  `.select('username stats.totalPoints stats.bestStreak stats.totalCorrect achievements')` —
  **NOT AN ISSUE** for the leaderboard query specifically. However `findAllUsers` (lines 56-64,
  admin user list) and `findById`/`findByEmail` (lines 3-9, used by the auth middleware path and
  most services) select/return the full document including `avatar` (a base64 string, up to
  500,000 chars per `MAX_AVATAR_LENGTH` in `userService.js:9`) — so auth-adjacent reads still
  load it.
- Leaderboard viewer identification: the API returns no stable per-row identifier: the
  frontend's `findCurrentUserRank` (`frontend/public/js/leaderboard.js:24-31`) matches by
  `row.username === me.username` plus (per the earlier full read) `totalPoints`/`bestStreak`/
  `totalCorrect` all matching — a heuristic that breaks down whenever two users share both a
  username and matching stats, which username's lack of uniqueness makes possible.

Plan: Phase 3 DECISION on case-insensitive unique usernames, adds avatar-exclusion projections
where unnecessary, and adds a server-computed `isCurrentUser` boolean to the leaderboard
response.

## 10. Token invalidation on ban/password change/reset

**Status: CONFIRMED — none of these invalidate existing JWTs.**

`loginUser` (`backend/services/authService.js:40-44`) signs
`jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, { expiresIn: '1h' })` — no
`tokenVersion` or any revocable claim. `authenticateToken.js:11-13`'s `verifyJwt` is a plain
`jwt.verify` with no database lookup, so it cannot detect a subsequent ban/password
change/reset. `loginUser` does reject banned users at login time (line 36-38), but a user
already holding a valid token from before being banned keeps working for the rest of that
token's 1-hour lifetime; `resetPassword` (`authService.js:74-90`) and any admin-triggered
password change similarly leave previously issued tokens valid. Plan: Phase 4 adds
`tokenVersion` to `User`, includes it in the JWT, and checks it in `authenticate`.

## 11. Admin Bearer token storage location

**Status: CONFIRMED — `localStorage`.**

`frontend/public/js/api.js` reads `localStorage.getItem('adminToken')` for every admin request
(lines 112, 120, 125, 130, 136, 141, 147, 153), sent as `Authorization: Bearer <token>`. This is
readable by any script running on the page (XSS-exposed), unlike the regular-user `token`
cookie which is `httpOnly`. Plan: Phase 4 DECISION between an httpOnly-cookie + CSRF scheme for
admin auth, or keeping Bearer with `sessionStorage` + short expiry + strict CSP.

## 12. CSRF cookie vs JWT cookie — name/flags/Domain/maxAge, and login-state detection

**Status: PARTIALLY.**

`setAuthCookies` (`backend/utils/authCookies.js:14-23`) sets both cookies with the *same*
`expires` value computed once (line 16, `COOKIE_MAX_AGE_MS = 3600000`, matching the JWT's `1h`
expiry) — so `token` and `csrfToken` are already aligned in lifetime; this is **NOT AN ISSUE**,
contrary to what "misaligned maxAge" framing might suggest. What is real: neither cookie sets a
`Domain` attribute (both default to the exact host, i.e. host-only — actually the safer
default, not a sibling-subdomain leak by itself, but also not hardened against it), and neither
uses the `__Host-` prefix that would guarantee host-only + `Secure` + `path=/` at the browser
level. `cookieOptions` (`authCookies.js:5-12`) sets `secure` only when
`NODE_ENV==='production'` and `sameSite:'Lax'`; the CSRF check itself
(`backend/middleware/csrf.js:10-23`) is plain double-submit (cookie value must equal the
`X-CSRF-Token` header) with no HMAC binding to the session/user. Frontend login-state detection
is `isLoggedIn()` = `Boolean(getCsrfToken())` (`frontend/public/js/api.js:167-168`) — a
synchronous cookie-presence check with no server round-trip, so it can't detect an
already-expired-but-still-cookied session or a server-side revocation. Plan: Phase 4 adds
`__Host-` prefixing and/or HMAC-bound CSRF tokens, and a `GET /api/v1/auth/me` (or equivalent)
so the frontend can detect real auth state.

## 13. Contact auto-reply content and limits

**Status: CONFIRMED.**

`sendContactEmail` (`backend/utils/emailUtils.js:21-64`) sends an auto-reply to the
user-supplied `email` address that includes `safeMessage` — the user's own message,
HTML-escaped (`escapeHtml`, lines 11-19) but still echoed verbatim in content (lines 47-49).
Because the recipient address is also attacker-controlled and the message body is
attacker-controlled, this is usable as a free-text email relay/spam primitive. The only
rate limit is `contactLimiter` (`backend/app.js`, 5 requests/15 min, per-IP via
`express-rate-limit`'s default IP key) — CONFIRMED no global/site-wide daily cap exists. Plan:
Phase 4 DECISION on removing the auto-reply entirely vs. keeping it with a global daily cap.

## 14. Password-reset token storage

**Status: CONFIRMED — stored in plain text.**

`requestPasswordReset` (`backend/services/authService.js:64-65`) generates
`crypto.randomBytes(20).toString('hex')` and stores it via
`resetPasswordRepository.upsertResetKey`, which writes `{ resetKey, createdAt }` directly
(`backend/repositories/resetPasswordRepository.js:3-9`) into the `ResetPassword` model
(`backend/models/resetPassword.js`) with no hashing. Lookup is a plain `findOne({ resetKey })`
(`resetPasswordRepository.js:11-13`, `authService.js:75`) — no `crypto.timingSafeEqual`, since
the comparison happens inside MongoDB's query engine, not in JS. Anyone with read access to the
`resetpasswords` collection (a DB dump, backup leak, etc.) gets directly usable reset tokens.
Plan: Phase 4 stores only a SHA-256 hash of the token and compares with
`crypto.timingSafeEqual`.

## 15. `/metrics`, `/api-docs` exposure and `trust proxy`

**Status: CONFIRMED (both halves).**

`backend/app.js:118-119` calls `setupSwagger(app)` and `setupMetrics(app)` unconditionally,
with no `NODE_ENV` check, auth middleware, or IP restriction anywhere in the file — both
`/api-docs` and `/metrics` are reachable in production exactly as in development. Separately,
`grep -rn "trust proxy" backend/` returns nothing: Express's `trust proxy` setting is never
configured, so if the app sits behind a reverse proxy/load balancer in production,
`req.ip` (which `express-rate-limit`'s default key generator uses) resolves to the proxy's
address, not the real client's, making all rate limiters (`generalLimiter`, the per-route
`createAuthLimiter()` instances, `contactLimiter`) effectively limit by proxy IP instead of per
client. Plan: Phase 4 gates `/metrics` behind a bearer token/IP allow-list, gates `/api-docs`
behind an env flag, and configures `trust proxy` from an env variable.

## 16. Topic-tag distribution

**Status: CONFIRMED as described — highly fragmented.**

Computed directly from `backend/database/questions.json` (47 questions):

- **92 distinct topic tags** across 47 questions.
- Top tags: `Lists` (20), `Loops` (13), `Strings` (9), `Dictionaries` (8), `Mutable` (5),
  `Iteration` (5), `Sets` (5), `Break Statement` (4), `Integers` (4).
- **64 of the 92 tags (70%) appear on exactly one question**, e.g. `String Indexing`,
  `Reference Counting`, `Modulo Operator`, `Exponentiation Operator`, `maketrans`, `translate`,
  `removeprefix`, `removesuffix`, `swapcase`, `Sorting with key function`, `dict_keys`, `zip`,
  `ord`, `chr`, `enumerate`, `map`, `stdout`, `Files`, `print`, `while loop`, and more (full list
  in the computation above).

This fragmentation is why topic/mastery/coverage features operate on a very sparse, inconsistent
taxonomy today. Plan: Phase 3 proposes a canonical ~10-15 topic taxonomy and an old→canonical
tag mapping for review before any migration is written.

---

## Summary table

| # | Item | Status |
|---|------|--------|
| 1 | Server-authoritative sessions | CONFIRMED |
| 2 | Client-supplied mode | CONFIRMED |
| 3 | Repeat-answer points farming | CONFIRMED |
| 4 | Study mode exposure (unauth + daily-challenge leak) | CONFIRMED |
| 5 | Daily Challenge seed/timezone/freezing | CONFIRMED |
| 6 | `topicStats` counts attempts, not distinct questions | CONFIRMED |
| 7 | Orphaned data on delete/retag (delete cascade OK) | PARTIALLY |
| 8 | Classic exclusion is client-side/per-request | CONFIRMED |
| 9 | Username uniqueness / avatar projection / leaderboard row ID | CONFIRMED |
| 10 | No token invalidation on ban/password change/reset | CONFIRMED |
| 11 | Admin token in `localStorage` | CONFIRMED |
| 12 | CSRF cookie vs JWT cookie (maxAge aligned; no `__Host-`/HMAC) | PARTIALLY |
| 13 | Contact auto-reply echoes content, no global cap | CONFIRMED |
| 14 | Reset tokens stored in plain text | CONFIRMED |
| 15 | `/metrics`, `/api-docs` public; no `trust proxy` | CONFIRMED |
| 16 | 92 tags on 47 questions, 64 single-occurrence | CONFIRMED |

---

## Phase 1 addendum — server-authoritative quiz sessions (implemented)

Phase 1 closed items 1, 2, 3 and (for Classic/Blitz/Survival) 8. Summary of what changed and
the decisions taken, for the final report and for Phase 6's rewrite of the system description.

**New/changed backend surface:**
- `QuizSession` model (`backend/models/quizSession.js`) and `AnswerEvent` model
  (`backend/models/answerEvent.js`, one document per attempt; groundwork for future
  adaptive-difficulty features, not yet consumed anywhere).
- `POST /api/v1/quiz/sessions`, `POST /api/v1/quiz/sessions/:id/next`,
  `POST /api/v1/quiz/sessions/:id/answer`, `POST /api/v1/quiz/sessions/:id/reveal`
  (`backend/routes/v1/quizRoutes.js`, `backend/services/quizSessionService.js`). Guests may use
  all four (no `authenticateToken`); a session belonging to a logged-in user can only be driven
  by that same user (`loadOwnedSession`, 404 on mismatch/missing/malformed id).
- **Breaking change:** `POST /api/v1/users/user-progress` is removed. It took `mode` and an
  implied outcome directly from the client, which was exactly the item-2/item-3 bypass; scoring
  now only happens inside `submitAnswer`/`revealAnswer`, which derive `mode` from the session and
  `isCorrect` from a server-side lookup, never from the request body. The read-only
  `GET /api/v1/users/user-progress` is unchanged. `frontend/public/js/api.js` and
  `frontend/public/js/questions.js` were updated in this same phase to use the new endpoints.

**DECISION 1 — Blitz pause-on-wrong-answer: simplified, no pause (user's choice).**
*Old behavior:* the frontend timer (`frontend/public/js/questions.js`, pre-Phase-1) called
`clearBlitzTimer()` on every submit and, on a wrong retry, `startBlitzTimer({ resume: true })`,
which resumed the countdown from whatever time was left when the answer was submitted — so the
clock effectively paused for the round-trip and any thinking time between attempts, and every
attempt (1st, 2nd, 3rd) reset which timestamp "remaining time" was measured from. There was also
no server involved at all: the entire 45s limit was client-side state.
*New behavior:* the deadline (`servedAt + 45000ms + 1500ms` grace) is computed once, server-side,
when the question is served (`quizConfig.BLITZ_TIME_LIMIT_MS`/`BLITZ_LATENCY_GRACE_MS`,
`quizSessionService.serveNextQuestion`), and never recomputed or extended on a retry. Every
attempt against that question (1st, 2nd, 3rd) is checked against the same fixed deadline; a
submission after it is forced incorrect and immediately resolved regardless of remaining
attempts (`outcome: 'timeout'`). The frontend timer now just renders a countdown to that
server timestamp and never pauses/resumes.

**DECISION 2 — Cross-session points policy: first-correct-only (user's choice).**
Points are awarded the first time a user answers a given question correctly, ever, across all
modes and sessions; repeat correct answers award 0 points but still count toward
streaks/accuracy/topicStats. Implemented via a new `UserAnsweredQuestion.everCorrect` flag
(`backend/models/userAnsweredQuestion.js`), checked before scoring and updated atomically in the
same upsert that marks the question answered (`userAnsweredQuestionRepository.markAnswered`).
`userService.applyAnswerOutcome` returns `alreadyCorrectBefore`, which the API surfaces via
`pointsWithheldReason` so the frontend can explain a 0-point correct answer instead of it looking
like a bug. **Narrowed in the Phase 1 follow-ups below** to specifically mean "first-attempt
correct," not just "correct."

**DECISION 3 — Existing farmed points: left untouched, remediation script written but not run.**
`backend/scripts/resetFarmedPoints.js` (`--dry-run` supported, idempotent) recomputes
`stats.totalPoints` and drops now-unqualified points achievements. It does **not** touch
`totalAnswered`/`totalCorrect`/`topicStats`/streaks. Documented limitation: `UserAnsweredQuestion`
never tracked per-question correctness before this phase, so the exact historical set of
correctly-answered questions can't be recovered; the script estimates it as
`min(totalCorrect, distinct questions ever answered)` priced at the Classic base rate, which is a
conservative upper bound, not an exact reconstruction. Not run against any database as part of
this phase — the author will decide separately whether/when to run it.

**DECISION 4 — `AnswerEvent` and guests: guest attempts are not recorded.**
Guests have no durable identity to attribute events to across sessions, so recording their raw
attempts would add storage/privacy surface with no analytical benefit later; `AnswerEvent`
documents are only created when `session.userId` is set
(`quizSessionService.recordAttempt`/`resolveBlitzTimeout`).

**Other behavior now enforced that wasn't before:** Classic and Blitz share a 3-attempt cap
(`quizConfig.MAX_ATTEMPTS`) with an explicit `/reveal` step after exhaustion — this is a
**deliberate change** for Blitz specifically (the pre-Phase-1 client had no server-side cap on
Blitz at all): without it, a fast typist could brute-force all remaining options one after
another within the 45s deadline at no cost beyond the clock running down, since nothing forced
commitment to an answer. The shared 3-attempt cap makes Blitz require real recall under time
pressure instead of exhaustive guessing. Survival ends the session on the first wrong answer and
rejects further answers/`next` calls; a client can no longer skip an unanswered Blitz question
for free (`next` while unresolved auto-scores it as a timeout); a malformed, missing, or foreign
`sessionId` returns 404 on every session endpoint.

---

## Phase 1 follow-ups (implemented, separate commit)

Four small corrections requested after reviewing Phase 1, before starting Phase 2.

**1. Scoring by attempt.** Points and streak extension now require a *first-attempt* correct
answer specifically (`attemptNumber === 1`), not just any correct answer within the 3-attempt
window. Getting a Classic/Blitz question right on attempt 2 or 3 still counts toward
`totalCorrect`/`topicStats` accuracy, but awards 0 points and resets `currentStreak` to 0 (a
wrong attempt already preceded it). A revealed answer (`/reveal`) still always scores as
incorrect, so it already awarded no points and broke the streak — unchanged. `UserAnsweredQuestion
.everCorrect` is now set only on a first-attempt correct answer, so a question a user only ever
guessed right on attempt 2/3 remains eligible for real points the next time they get it right on
a first attempt, in a future session. Implemented in `userService.applyAnswerOutcome` (new
`attemptNumber` parameter, `firstAttemptCorrect` derived from it) and threaded through from
`quizSessionService`'s three call sites. **Did this conflict with anything already built?** No —
Survival and Daily Challenge (Phase 2) are single-attempt by construction, so every correct
answer there is already attempt 1 and behaves exactly as before; only Classic/Blitz's multi-attempt
retry path changes. The API response's `alreadyMastered` boolean is replaced by a
`pointsWithheldReason` field (`'not_first_attempt' | 'already_mastered' | null`) so the frontend
can give the right explanation for a 0-point correct answer instead of collapsing both cases into
one message.

**2. Blitz's 3-attempt cap documented as deliberate** — see the paragraph directly above; added
here per that instruction.

**3. Guest sessions confirmed — hardened.** Yes, guests go through the same `QuizSession` flow as
logged-in users (`userId: null`); this was already true in Phase 1 and is unchanged. Two
follow-ups applied:
   - `POST /api/v1/quiz/sessions` now has a dedicated rate limiter (60 new sessions per 15 minutes
     per IP, `backend/routes/v1/quizRoutes.js`), scoped to that one route rather than its shared
     path prefix so it doesn't also throttle in-progress answer/next/reveal calls.
   - The public `sessionId` is no longer the Mongo `_id` (predictable-ish: a 4-byte timestamp +
     a mostly-stable per-process/machine component + an incrementing counter, none of it designed
     to resist guessing). `QuizSession` now has a `token` field — 32 bytes from `crypto.
     randomBytes`, hex-encoded — generated in `quizSessionRepository.create` and used as the only
     public session identifier; all lookups are by `token`, not `_id` (`AnswerEvent.sessionId`
     still stores the internal `_id` as a normal foreign key — that's never exposed, so it didn't
     need to change). This applies uniformly to guest and logged-in sessions alike, since there's
     no reason a logged-in session should be enumerable either.

**4. Test coverage audit.** Before this follow-up, **no test in the suite asserted on
achievements, `topicStats`, or `bestStreak` at all** — not in the original `progress.test.js`
(trimmed in Phase 1) and not yet in the new `quizSessions.test.js`. Added in this follow-up:
achievement unlocking (`first_correct`) through the session `/answer` endpoint, `topicStats`
`attempted`/`correct` counters, `bestStreak` growth across consecutive correct answers, and a
first-attempt-vs-later-attempt scoring/streak test for item 1 above.

**Bug found by the new topicStats test, fixed in this commit:** `topicStats` entries for a topic
a user had never answered before were silently never incremented. `user.topicStats.push(entry)`
pushes a plain object into a Mongoose `DocumentArray`, which casts it into a new subdocument
rather than reusing that object reference — so the code's subsequent `entry.attempted += 1` /
`entry.correct += 1` mutated an orphaned plain object that was never actually part of the saved
array, while the real (freshly cast) array element stayed at its `{correct: 0, attempted: 0}`
default. This bug existed unchanged from before Phase 1 (same code, `backend/services/
userService.js`, originally in `updateUserProgress`) and had never been caught because, as noted
above, nothing tested `topicStats` before this follow-up — it's a direct example of why that
coverage gap mattered. Fixed by re-reading the just-pushed element from the array
(`user.topicStats[user.topicStats.length - 1]`) instead of mutating the pre-push local variable;
only a first-topic-ever-seen case was affected, since `.find()` on an existing entry already
returns the real, mutable subdocument.

---

## Phase 2 addendum — Study mode and Daily Challenge integrity (implemented)

Closes AUDIT.md items 4 and 5. Decisions given in advance for this phase:

**Study mode requires authentication, and excludes today's Daily Challenge questions.**
`GET /api/v1/questions/study` now has `authenticateToken` in its middleware chain
(`backend/routes/v1/questionRoutes.js`) — previously fully public. `studyService.getStudyQuestions`
now fetches today's frozen Daily Challenge question ids
(`dailyChallengeService.getDailyQuestions()`) and excludes them via the query itself, not a
post-filter (`questionService.buildQuestionQuery`'s `excludeIds` support, extended to
`findQuestionPage`/`getQuestionsForStudy` so pagination/`meta.total` stay accurate). The exclusion
lifts automatically at the next Yerevan reset, since a new day means a new frozen set.
`frontend/public/js/study.js` now calls `requireAuth()` on load and redirects to login on a 401,
matching the pattern already used by the Daily Challenge and quiz pages.

**Daily Challenge timezone: Asia/Yerevan (user's choice); next reset shown on the page.**
`dailyChallengeService.getTodayKey()` now formats "today" via
`Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yerevan' })` instead of UTC. `getNextResetAt()`
computes the next Yerevan midnight as a UTC instant by deriving the zone's actual offset from
`Intl` rather than hardcoding `+04:00` — so this keeps working correctly even if Armenia's
civil-time rules ever change (it has used a fixed UTC+4 with no DST since 2012, but nothing here
assumes that permanently). `GET /api/v1/challenges/daily` now returns `nextResetAt`, rendered by
`frontend/public/js/daily.js` as a live "Resets in Xh Ym" badge, computed against the viewer's own
clock (no client-side timezone math needed, since the server already returns an absolute UTC
timestamp).

**Daily Challenge seed: HMAC-SHA256 + a documented deterministic PRNG, replacing the old
chained-SHA256 shuffle.** `dailyChallengeService.buildDaySeed(dateKey)` computes
`HMAC-SHA256(DAILY_CHALLENGE_SEED_SECRET, dateKey)` — unlike a plain hash of the date, this can't
be predicted by someone without the server secret. The digest seeds `mulberry32`, a small, widely
documented public-domain 32-bit PRNG, whose output stream drives a standard Fisher–Yates shuffle
of the full question-id pool. This replaces the previous approach (a fresh SHA-256 per swap,
keyed only by a public string `pyquiz-daily-<date>` with no secret at all — anyone could
precompute a day's order). New required env var: `DAILY_CHALLENGE_SEED_SECRET`
(`backend/env.example`). Unlike `MONGODB_URI`/`JWT_SECRET`, this is **not** enforced by a
hard process-exit startup check in `app.js` — it's read lazily, and `buildDaySeed` throws a
clear `AppError(500, 'Daily challenge is not configured.')` only when a *new* day's set actually
needs to be generated. This was a deliberate choice to avoid forcing every test file in the suite
to set yet another required secret just to boot the app (the existing `MONGODB_URI`/`JWT_SECRET`
checks are already unconditional because literally every request needs them); tests that exercise
Study or Daily Challenge set `DAILY_CHALLENGE_SEED_SECRET` in their own preamble, same as the
existing `JWT_SECRET` convention.

**`DailyChallengeSet` persists and freezes each day's questions.** A new model/repository
(`backend/models/dailyChallengeSet.js`, `backend/repositories/dailyChallengeSetRepository.js`)
stores `{date, questionIds}`, created on the first request for a given day
(`dailyChallengeSetRepository.createIfMissing`, racing concurrent first-requests safely via the
unique index on `date`) and read on every later request that day instead of reshuffling. Robust to
a question being deleted after freezing: `getDailyQuestions` re-fetches only the ids that still
exist (`Question.find({_id: {$in: set.questionIds}})`), silently dropping any that don't, so a
mid-day deletion shrinks that day's challenge by one question instead of erroring the whole thing.

**Daily Challenge answers now count as real evidence, consistently with quiz sessions.** Per the
user's decision, each answer in a submission — not just the aggregate score — now goes through the
same bookkeeping quiz sessions use: `answerEventRepository.createEvent` (mode: `'daily'`,
`sessionId: null` — `AnswerEvent.sessionId` is now nullable and `mode`'s enum was extended to
include `'daily'`, since Daily Challenge has no `QuizSession`), and
`userService.applyAnswerOutcome` (updates `totalAnswered`/`totalCorrect`/`currentStreak`/
`bestStreak`/`topicStats`, and — since every Daily Challenge question is single-shot, so
`attemptNumber` is always `1` — sets `UserAnsweredQuestion.everCorrect` on a correct answer,
exactly like a first-attempt-correct quiz answer would). The flat 20-points-per-correct bonus is
awarded **separately** from the cross-session first-correct-ever rule (completing the day's
challenge always pays, even on a question the user has already earned points for before):
`applyAnswerOutcome` is called with `pointsOverride: 0` for every Daily question (so it never
awards its own per-question points), and the real `score * 20` is applied once via the existing
atomic `userRepository.claimDailyChallenge` increment. To keep this safe under a concurrent
double-submission (already tested), all of the scoring/evidence work is split into a pure
computation phase (no writes) followed by the atomic claim, with the per-question
`AnswerEvent`/`applyAnswerOutcome` calls happening **only after** that claim succeeds — so a
losing concurrent request can't double-count `topicStats`/streaks even though it does redundant
(side-effect-free) computation first.

**Tests added:** Yerevan-vs-UTC day-boundary and next-reset-time unit tests; a frozen set stays
unchanged after new questions are added; a question deleted after freezing is dropped without
erroring; a full evidence trail (AnswerEvent, `UserAnsweredQuestion.everCorrect`, `topicStats`,
streak extension/reset) from a Daily Challenge submission; Study mode requiring auth and excluding
today's Daily Challenge set.

---

## Pre-Phase-3 fixes (implemented, separate commit)

Three small items requested before starting Phase 3.

**1. `trust proxy` (closes item 15's second half) + rate-limit keying.**
`backend/config/trustProxy.js` configures Express's `trust proxy` setting from a new `TRUST_PROXY`
env var (documented in `backend/env.example`): a hop count (`"1"` for one reverse proxy, the
common case), `"true"` to trust the whole chain, or unset/`"false"` for Express's default (trust
nothing). Called from `app.js` before any middleware that reads `req.ip`. Tested directly
(`backend/tests/trustProxy.test.js`) against a minimal standalone Express app asserting `req.ip`
resolves from `X-Forwarded-For` only when `TRUST_PROXY` is set.

`POST /api/v1/quiz/sessions`'s rate limiter (`backend/routes/v1/quizRoutes.js`) now keys by
`user:<userId>` for authenticated requests and `ip:<address>` for guests (via express-rate-limit's
`ipKeyGenerator` helper, needed for correct IPv6 handling), with `optionalAuthenticate` moved
before the limiter so `req.user` is populated when the key is computed. The two are capped
separately: **60/15min per authenticated user** (unchanged — each account gets its own budget
regardless of who it shares a network with) and **300/15min per guest IP** (raised from the
previous flat 60, since a shared IP is the *normal* case for a guest specifically — a classroom or
office behind one NAT/proxy address — not an edge case worth penalizing).

**Does the general 300/15min limiter (`generalLimiter`, `app.js`) have the same shared-IP
problem? Yes — and it's broader.** It uses express-rate-limit's plain default IP-based keying with
no exceptions, and it's mounted on the whole `/api` prefix, so it covers virtually every request
the frontend makes (every question fetch, every answer submit, every page's several API calls) —
not just session creation. A classroom or office behind one NAT IP shares this single 300-request
budget across *all* of that traffic combined, which is a much easier ceiling to hit than the
narrower, now-`user`-keyed session limiter above. This is a real instance of the same problem,
**left unchanged in this commit** — it's a broad, load-bearing limiter used by every endpoint, so
widening its blast radius (e.g. also splitting it by authenticated user vs. guest IP) deserves its
own explicit decision rather than a drive-by change alongside this one. Flagging it here for that
decision.

**2. `DAILY_CHALLENGE_SEED_SECRET` missing — exact behavior, now implemented:**
   - It never falls back to a default or predictable secret anywhere in the code — confirmed by
     inspection; there is no fallback value to remove.
   - **At startup**, `app.js` logs a clear `logger.warn(...)` if the variable is unset. This is
     non-fatal (unlike the `MONGODB_URI`/`JWT_SECRET` checks, which `process.exit(1)`): the app
     still boots and every other feature works normally.
   - **While frozen sets already exist**, Daily Challenge keeps working with no interruption —
     `getDailyQuestions` only calls `buildDaySeed` (the function that needs the secret) when no
     `DailyChallengeSet` row exists yet for that date.
   - **The moment a new day's set actually needs to be generated** (no row for that date) without
     the secret present, `buildDaySeed` throws `AppError('Daily Challenge is temporarily
     unavailable.', 503)`, which both `GET /api/v1/challenges/daily` and
     `POST /api/v1/challenges/daily/submit` surface as a 503 response — not a 500, and not a
     silent fallback. Tested in `backend/tests/dailyChallenge.test.js` (the 503 itself, and that a
     set already frozen before the secret went missing keeps serving fine).

**3. UTC → Asia/Yerevan transition on `User.dailyChallenge.date` — written note (no code
change).** `dailyChallenge.date` is a plain string produced by whatever `getTodayKey()` returned
at completion time; Phase 2 changed that function from a UTC date to a Yerevan date. Because
Yerevan is UTC+4, the two schemes produce the *same* date string for 20 of every 24 UTC hours
(00:00–19:59 UTC) and differ only for the remaining 4 (20:00–23:59 UTC, where the Yerevan date is
already one day ahead). Consequence: if a user completed the Daily Challenge during that 4-hour
UTC window on the day this deployed, their stored `date` is one calendar day *behind* what the new
scheme now computes as "today" — so the "already completed today" check
(`user.dailyChallenge.date === dateKey`) reads as false, and that one user could complete the
(new) "today's" challenge again, once, earning a second 20-points-per-correct bonus. It cannot
happen more than once per affected user: their `dailyChallenge.date` gets overwritten with a
new-scheme value on that second completion, and every user unaffected by the 4-hour window is
never affected at all. A reverse case (wrongly *blocking* a legitimate completion) is not
possible: the transition only ever moves a stored date **backward** relative to the new scheme,
which can only make the equality check *false* where it was previously *true* — never the other
way around. No corrective migration is proposed: the old scheme's stored dates don't record a
time-of-day, so there's no way to reconstruct which UTC hour a past completion actually happened
in, and even a perfect fix would only prevent a handful of one-time 20-point bonuses — not worth
the complexity of migration/compatibility code for a scheme that's now permanently changed and
self-heals within one day for every affected account.

---

## Phase 3 — taxonomy proposal, revised (approved and migrated — see "Phase 3 addendum — taxonomy
migration executed" below for the applied result)

Closes AUDIT.md item 16's remediation. This section is the proposal as originally written and
presented for approval; the migration it describes has since been approved and run — see the
addendum below for what was actually applied, the counts as migrated, and one bug found along the
way. Per the revision request:

- **Variables & Assignment merged into Mutability & Identity**, renamed **Names, Mutability &
  Identity** — 11 canonical topics now, not 12.
- **Every one of the 47 questions was re-read in full** (code, options, answer, explanation — not
  just its old tags) and assigned exactly **one primary topic**: the concept a learner must
  understand to answer it correctly, not the data type that happens to appear in the code (e.g. a
  question about aliasing a list is primary **Names, Mutability & Identity**, not Lists — same
  principle applied throughout the table below). Secondary topics are optional and listed only for
  filtering/search; **mastery will be computed from primary topics only.**

### Revised canonical topics (11) and primary-question counts

| # | Canonical topic | Primary questions |
|---|------------------|--------------------|
| 1 | Names, Mutability & Identity | 12 |
| 2 | Loops & Control Flow | 6 |
| 3 | Dictionaries | 6 |
| 4 | Data Types & Conversion | 5 |
| 5 | Strings | 4 |
| 6 | Functions & Built-ins | 4 |
| 7 | Sets | 4 |
| 8 | Lists | 3 |
| 9 | Indexing & Slicing | 2 |
| 10 | Tuples | 1 |
| 11 | Numbers & Arithmetic | 0 |

**Three topics fall below the proposed `MIN_QUESTIONS_FOR_MASTERY = 3`** and would show "Not
enough questions yet" for every user under that rule: Indexing & Slicing (2), Tuples (1), and
Numbers & Arithmetic (**0** — see below). This is a direct, honest consequence of picking one
primary concept per question rather than letting every question count toward every topic its code
happens to touch, and is worth your review before approval:

- **Numbers & Arithmetic has zero primary questions.** Several questions touch arithmetic (modulo,
  exponentiation, bool-in-arithmetic) but in every case the thing that actually determines the
  right answer is something else — a type-conversion rule or a loop/break condition — so arithmetic
  itself was never the deciding concept. This taxonomy, applied to the current 47 questions, simply
  doesn't have a question whose primary lesson is arithmetic. Options: leave the topic in place
  (it'll read "Not enough questions yet" until such questions are added), fold it into **Data Types
  & Conversion** (where its closest relatives — Q9, Q25 — already live), or treat it as a flagged
  gap for future question-writing. Flagging rather than deciding for you.
- **Tuples (1) and Indexing & Slicing (2)** are thin because most tuple- and slicing-adjacent
  questions turned out to primarily test something else once re-read in full (unpacking mechanics
  → Names, Mutability & Identity; aliasing → same). Same options apply: leave them, merge them into
  a neighboring topic, or accept the "not enough questions yet" state as accurate for now.
- **Names, Mutability & Identity is large (12 of 47, ~26%)** — expected from merging two categories
  into one, and from this taxonomy's rule that pure name-binding/aliasing/identity questions (the
  swap idiom, extended unpacking, `is` vs `==`, rebinding vs. mutation) all land here regardless of
  which container type appears in the code, since that's exactly the kind of "data type in the code
  isn't the point" case the revision asked for.

### One row per question: summary, primary topic, secondary topics, reason

| # | Question summary | Primary topic | Secondary topics | Why this primary |
|---|---|---|---|---|
| 1 | List index assignment beyond current length | Lists | Names/Mutability/Identity, Indexing & Slicing | List-specific mechanic: assignment can't extend a list past its length (IndexError). |
| 2 | Assigning to a tuple index | Names, Mutability & Identity | Tuples | Fails specifically because tuples are immutable — the immutability itself is the lesson. |
| 3 | Looping over a list of strings, printing each one's first char | Strings | Lists, Loops & Control Flow | The loop is trivial; getting `word[0]` right requires string indexing. |
| 4 | Looping directly over a string's characters | Strings | Loops & Control Flow | Tests that strings are iterable character-by-character. |
| 5 | Comparing an int to a string with `>` | Data Types & Conversion | Numbers & Arithmetic | Python disallows ordering comparisons across incompatible types — a type-compatibility fact. |
| 6 | Assigning to a string index | Names, Mutability & Identity | Strings | Same immutability lesson as Q2, applied to strings. |
| 7 | For-loop with `continue` and `break` | Loops & Control Flow | — | Tests precise continue/break sequencing. |
| 8 | Converting a list with duplicates to a set | Sets | Lists | Tests that `set()` de-duplicates automatically. |
| 9 | String concatenation vs. int/bool addition, then `str()` | Data Types & Conversion | Strings, Numbers & Arithmetic | Decisive step is knowing `True` behaves as `1` in arithmetic before conversion. |
| 10 | Assigning one list variable to another, then mutating | Names, Mutability & Identity | Lists | Textbook aliasing: `l2 = l1` binds a second name to the same mutable object. |
| 11 | `is`/`==`, `sys.getrefcount`, small-int interning | Names, Mutability & Identity | Lists, Numbers & Arithmetic | Entirely about identity vs. equality and reference semantics. |
| 12 | `len()` on a list containing a nested list | Lists | Functions & Built-ins | Tests that a nested list counts as one top-level element. |
| 13 | Loop with a conditional print and a break | Loops & Control Flow | Lists | Tests conditional-print-then-break sequencing inside a loop. |
| 14 | Loop with continue, break, and modulo | Loops & Control Flow | Numbers & Arithmetic | The modulo check is incidental; the ordering of continue vs. break is the lesson. |
| 15 | Loop that breaks once a squared value equals 9 | Loops & Control Flow | Numbers & Arithmetic | Tests exactly when the break condition is reached. |
| 16 | Reassigning a name to a repeated list (`list1 * 5`) | Names, Mutability & Identity | Lists | `list1 * 5` creates a new object; rebinding `list1` doesn't touch the original. |
| 17 | Aliased list mutated via slice assignment | Names, Mutability & Identity | Lists, Indexing & Slicing | Slice assignment mutates in place, so every alias sees it — contrasts directly with Q16. |
| 18 | Indexing into a dict's `.keys()` view | Dictionaries | Indexing & Slicing | `.keys()` returns a view object, not a list — it doesn't support indexing. |
| 19 | `str.maketrans` + `.translate()` | Strings | Dictionaries | Tests character-level string substitution mechanics. |
| 20 | Chained `removesuffix`/`removeprefix`/`strip` | Strings | — | Tests that each method strips only what's explicitly at the edges, once. |
| 21 | `swapcase()` then `sort(key=len, reverse=True)` | Functions & Built-ins | Strings | Getting the final order right requires understanding sorting by a key function. |
| 22 | `sorted(set(ls), reverse=True)` | Sets | Functions & Built-ins | `set()` determines which values exist at all, before `sorted()` orders them. |
| 23 | Three slices with different start:stop:step | Indexing & Slicing | Lists | Requires reasoning through several step/negative-index combinations. |
| 24 | Dict with mixed int/str keys, some repeated | Dictionaries | Data Types & Conversion | `1` and `'1'` are different keys — tests key identity by type and value. |
| 25 | `int(bool())` / `bool(int())` and arithmetic | Data Types & Conversion | Numbers & Arithmetic | Tests round-tripping between `bool` and `int` and their default falsy values. |
| 26 | `for i in x` where `x` is an int | Data Types & Conversion | Loops & Control Flow | Tests that `int` is not an iterable type, unlike `str`/`list`. |
| 27 | `for i in di` — default dict iteration | Dictionaries | Loops & Control Flow | Tests that iterating a dict by default yields its keys. |
| 28 | Mixed identity/equality/type checks across containers | Names, Mutability & Identity | Data Types & Conversion, Sets, Lists | Decisive checks are `is` (interning) and that `{}` is a dict, not a set. |
| 29 | `.keys()` then `di[x]` lookup in a loop | Dictionaries | Loops & Control Flow | Tests combining key iteration with key-based value lookup. |
| 30 | `.values()` used mistakenly as keys | Dictionaries | Loops & Control Flow | Tests the difference between `.values()` and `.keys()` — using a value as a key raises KeyError. |
| 31 | `.values()` called on a set literal | Sets | Dictionaries | `{0, 1, 2}` is a set, not a dict — the confusion between the two literal syntaxes is the point. |
| 32 | `.add()` on a set while iterating it | Sets | — | Tests that `.add()` returns `None` and is a no-op for an already-present element. |
| 33 | `for i in range(0)` — an empty range | Loops & Control Flow | Functions & Built-ins | `range(0)` is empty, so the loop body never executes. |
| 34 | Swapping two variables; unpacking a string | Names, Mutability & Identity | Tuples, Strings | Tests the multiple-assignment swap idiom and unpacking a string into separate names. |
| 35 | Iterating a tuple of tuples, unpacking each | Tuples | Loops & Control Flow | Tests unpacking nested tuples during iteration — the tuple structure is central. |
| 36 | `a, *b = ls` and unpacking a `range` | Names, Mutability & Identity | Lists | Tests extended-unpacking syntax — how a starred name absorbs remaining items. |
| 37 | `a, *b, c = range(4)` and `*x, y = ls` | Names, Mutability & Identity | Lists | Tests extended unpacking in two positions in the same snippet. |
| 38 | Chained assignment aliasing vs. list rebinding | Names, Mutability & Identity | Lists | Contrasts `a = b = []` aliasing with a rebind (`ls = ls + [3]`) that breaks an alias. |
| 39 | Aliased list mutated, then `list + str` | Data Types & Conversion | Names/Mutability/Identity, Lists | The answer hinges on `list + str` raising TypeError, not on the (correctly-behaving) aliasing step. |
| 40 | Referencing an undefined, differently-cased name | Names, Mutability & Identity | Lists | Python is case-sensitive — `LS` is a different name from `ls` and is undefined. |
| 41 | Reassigning a variable to `.append()`'s return value | Lists | Data Types & Conversion | Tests that `.append()` mutates in place and returns `None`. |
| 42 | Redirecting and restoring `sys.stdout` | Functions & Built-ins | — | Tests how `print()` writes to whichever stream `sys.stdout` currently is. |
| 43 | `while x:` shrinking a string via slicing each iteration | Loops & Control Flow | Strings, Data Types & Conversion | Tests a while-loop terminating on an empty (falsy) string. |
| 44 | `.items()` unpacked in a for-loop with custom `sep`/`end` | Dictionaries | Strings | Tests unpacking key-value pairs from `.items()` during iteration. |
| 45 | `zip()` over two equal-length lists | Functions & Built-ins | Lists | Tests how `zip()` pairs two sequences element-by-element. |
| 46 | `zip()`/`map()` over two different-length strings | Functions & Built-ins | Strings | Tests `zip()` stopping at the shorter sequence and `map()` applying a function per character. |
| 47 | A big-step slice feeding `enumerate()`'s start value | Indexing & Slicing | Functions & Built-ins | A large slice step reduces the slice to one character, which then sets enumerate's start. |

This table was approved without changes (largest topic, Names/Mutability/Identity at 12/47 ≈
25.5%, did not exceed the ~third-of-47 flag threshold, so no split was proposed or made) — see the
addendum below for the executed migration.

---

## Phase 3 addendum — data consistency and statistics (implemented, everything except the taxonomy)

**Topic mastery is now computed live from source-of-truth collections, not a stored counter.**
`User.topicStats` (the array field incremented on every answer) is removed entirely.
`topicMasteryService.getTopicMastery` now computes, on every call: **coverage** from
`UserAnsweredQuestion` joined against the live `Question` collection (unchanged from before — this
was already how coverage worked), and **accuracy** from `AnswerEvent` (one document per attempt)
joined the same way — this part is new. This was chosen over "provide a recompute script" (the
original spec's other offered option) because a live-derived view can never drift out of sync with
a deletion or a retag the way an incrementally-updated counter did: it structurally cannot push
coverage above 100% (a deleted question simply can't appear in either numerator or denominator,
since both are computed by iterating the *current* `Question` collection) and a retagged
question's topics are correct on the very next read, with no migration step needed at all. The
tradeoff, stated plainly: **there is no attempt-level accuracy history before the Phase 1
deployment**, since `AnswerEvent` didn't exist before then — a long-time user's topic accuracy
will only reflect activity from Phase 1 onward, not their full history. All response field names
(`topic`, `total`, `answered`, `coverage`, `correct`, `attempted`, `accuracy`, `level`) and the
`{mastery, weakTopics}` shape are unchanged, so `frontend/public/js/account.js` needed no changes.

**Found and fixed while making this change:** removing the incremental-update code path also
removed the topicStats-push bug fixed in the Phase 1 follow-ups (it's simply gone, along with the
buggy pattern) — noted here for the record, not a new fix.

**Named constants** (`backend/config/masteryConfig.js`): mastery thresholds
(`MASTER_COVERAGE_THRESHOLD`, `MASTER_ACCURACY_THRESHOLD`, `INTERMEDIATE_COVERAGE_THRESHOLD`), the
weak-topic cutoff (`WEAK_TOPIC_MIN_ATTEMPTS`, `WEAK_TOPIC_ACCURACY_THRESHOLD`,
`WEAK_TOPIC_MAX_COUNT`), and the point-based rank tiers (`RANK_THRESHOLDS`, replacing an inline
if-chain in `userService.computeRank`) all live in one module now, values unchanged from before.

**Orphan/drift fixes.** Question deletion (`questionService.deleteQuestion`) now cascades to
`UserAnsweredQuestion` (so a deleted question can never keep counting toward "answered"/coverage —
closes item 7's first half); `AnswerEvent` is deliberately left alone, since it's an immutable
attempt log rather than a current-state record, and the live topic-mastery computation above
already excludes a deleted question's events from contributing to any topic (no topics to look up
for a question that no longer exists). Retagging consistency (item 7's second half) is resolved by
the same live-derivation choice above — nothing to migrate, no drift possible.

**Classic exclusion, made explicit and narrower (user's decision).** Classic mode's server-side
exclusion (`quizSessionService.serveNextQuestion`) now excludes only questions with
`UserAnsweredQuestion.everCorrect === true` (a new `findEverCorrectIds` repository query) —
**not** every previously-answered question as Phase 1 had it. A question only ever answered wrong,
or only ever guessed right on attempt 2/3, remains eligible for a real Classic attempt later. When
the pool is exhausted, the response now includes `canPracticeAgain: true` (Classic only, and only
for a non-practice session); the frontend (`frontend/public/js/questions.js`) offers **"Practice
again (no points)"**, which starts a new session with a `practiceMode` flag
(`QuizSession.practiceMode`, threaded through `createSessionSchema`) that skips the everCorrect
exclusion entirely, alongside **"Widen filters"** (returns to topic/difficulty selection). Practice
sessions can never earn points regardless — the first-correct-ever rule from Phase 1 already zeroes
points for an everCorrect question — so "no points" is accurate labeling, not a new restriction.

**Case-insensitive username uniqueness (user's decision: enforce it).** `User.usernameLower`
(lowercased, kept in sync by a `pre('validate')` hook — not `pre('save')`, which runs too late
relative to Mongoose's own required-field validation, a bug caught while testing this) carries a
`unique, sparse` index; `authService.registerUser` and `userService.updateProfile` both check it
explicitly first, so a collision is a clean 400 ("Username already exists.") rather than a raw
MongoDB duplicate-key error. **Deployment-order caveat:** existing accounts predate this field, so
before deploying this schema change to any database with existing users,
run `backend/scripts/backfillUsernameLower.js --apply` first (safe, idempotent, no renaming) and
then `backend/scripts/reportDuplicateUsernames.js` (report-only by default; `--apply` renames all
but the oldest account in each colliding group with a numeric suffix) if it reports any
collisions — the index is `sparse` specifically so a deployment that skips this step doesn't hard-
fail building it, but duplicates would still not be caught until the report script runs. **Neither
script has been run against any database in this commit** (dry-run only, against the local dev
database, confirmed 0 duplicates there).

**Avatar excluded by default (item 9).** `userRepository.findById`/`findByEmail`/
`findAdminByUsername` now `.select('-avatar')` — the only place that needs the (up to 500KB)
avatar is `getUserProfile`, which now calls a new `findByIdWithAvatar`. This matters most for
`applyAnswerOutcome`, called on every single answer, which no longer loads avatar data it never
reads. Excluding a field from what's read doesn't block writing it — `updateProfile` still sets
`user.avatar` and saves normally.

**Leaderboard `isCurrentUser` (item 9).** `GET /api/v1/users/leaderboard` now takes
`optionalAuthenticate` (still fully public for guests) and `userService.getGlobalLeaderboard`
compares each row's `_id` against the viewer's own id, returning `isCurrentUser: true` on at most
one row. `frontend/public/js/leaderboard.js`'s `findCurrentUserRank` heuristic (username + three
stats fields, ambiguous whenever two rows matched) is deleted along with the now-unnecessary
`api.getMe()` call it required.

**Tests added:** Classic re-serving a wrong-only question across sessions; the everCorrect
exclusion triggering `canPracticeAgain`, and practice mode bypassing it while still paying no
points; case-insensitive rejection at both registration and profile update (and that changing only
case of your own name is allowed); leaderboard `isCurrentUser` for the viewer/other rows/guests,
and that avatar is never present in its response; topic mastery's attempted/correct now asserted
via the public endpoint instead of reading the (now-removed) `topicStats` field directly.

---

## Phase 3 follow-ups (implemented, separate commit)

Three items requested before approving the revised taxonomy.

**1. General `/api` rate limiter — same user/IP keying as the sessions limiter.**
`app.js`'s `generalLimiter` (previously flat 300/15min by IP) now mirrors the quiz-sessions
limiter's approach: `optionalAuthenticate` runs first (mounted globally on `/api`), then
`generalLimiter` keys by `user:<id>` for authenticated requests (300/15min, unchanged budget, now
per-account) and `ip:<address>` for guests (raised to 1000/15min — this limiter covers virtually
every request the app makes, not just session creation, so a shared classroom/office IP needs more
headroom here than anywhere else).

**`TRUST_PROXY` — documented and enforced-by-warning that it must be an exact hop count, never
`true`.** `true` trusts every hop in `X-Forwarded-For`, including whatever the client itself put
there — a client can set that header to a different value on every request and be treated as a
"different IP" each time, which bypasses every IP-keyed rate limiter in the app outright, including
login/register brute-force protection (`createAuthLimiter`). This is now documented explicitly in
`backend/env.example` (never `true`; set the exact hop count, e.g. `1`) and `backend/config/
trustProxy.js` now logs a startup warning if `TRUST_PROXY=true` is set anyway (kept functional,
since Express itself supports it and a small number of legitimate all-hops-owned topologies exist,
but made impossible to miss). Tested directly: `backend/tests/trustProxy.test.js` shows that with
`TRUST_PROXY=true`, two requests with different `X-Forwarded-For` values are reported as two
different `req.ip`s — the exact mechanism of the bypass.

**2. Mastery for existing users — accuracy history gap made visible instead of silently
misclassifying.** Coverage has full history (`UserAnsweredQuestion` existed from the start);
accuracy only exists from the Phase 1 deployment (`AnswerEvent`). A topic with real coverage but
very few recorded attempts previously risked a confident-looking but statistically thin
classification (in the worst case, a single lucky/unlucky attempt swinging a topic in or out of
"master"). `topicMasteryService` now checks attempt count first: below `MIN_ACCURACY_EVENTS` (new
named constant in `masteryConfig.js`, value `3`) a topic with any coverage shows `level:
'measuring'` ("Accuracy being measured") instead of new/beginner/intermediate/master.
`WEAK_TOPIC_MIN_ATTEMPTS` is now defined as `MIN_ACCURACY_EVENTS` (rather than a separately-chosen
smaller number) so a topic can never be flagged "weak" while still in "measuring" state.

**3. AnswerEvent rows for a deleted question — confirmed, and now tested.** They are kept
permanently as history (`questionService.deleteQuestion` only cascades `UserAnsweredQuestion`,
never touches `AnswerEvent` — unchanged from the original Phase 3 commit). The live mastery
computation already ignored them correctly by construction: it looks up each `AnswerEvent`'s
topics via the *current* `Question` collection, and a deleted question simply isn't in that lookup
anymore, so its events silently contribute to no topic at all. This wasn't previously tested;
`backend/tests/topicMastery.test.js` now proves it directly — answering 3 of 4 questions in a topic,
deleting one of the answered ones, and confirming both that its `AnswerEvent` row still exists in
the database and that the topic's live `attempted`/`correct`/`answered`/`total` all drop by exactly
one rather than staying at the pre-deletion counts.

**New named constants** (`masteryConfig.js`): `MIN_ACCURACY_EVENTS = 3` (above) and
`MIN_QUESTIONS_FOR_MASTERY = 3` (a topic with fewer questions than this shows `level:
'unavailable'`, "Not enough questions yet" — added for the taxonomy revision below, but applies
today against the current tag set too).

**Tests added:** `TRUST_PROXY=true` request-spoofing demonstration; "measuring" state appearing
with thin attempt history and clearing once attempts reach the threshold; "unavailable" state for
a topic below the minimum question count; AnswerEvent history surviving question deletion while
being excluded from live mastery numbers.

---

## Phase 3 addendum — taxonomy migration executed (implemented, separate commit)

The revised taxonomy above was approved as written — no topic exceeded the flagged split
threshold, so nothing was merged or restructured beyond the proposal. This addendum records what
was actually done.

**Schema.** `Question.topics: [String]` (free-text) is replaced by `Question.primaryTopic: String`
(required, `enum: CANONICAL_TOPICS`) and `Question.secondaryTopics: [String]` (optional, same
enum, default `[]`). `backend/config/topicTaxonomy.js` is now the single source of truth for the
11-item canonical list, imported by the model, both validators, and the frontend (`topicTaxonomy.js`
mirrors it for the admin forms, which need the full list including zero-question topics — unlike
`GET /api/v1/questions/topics`, which returns only topics with at least one primary question).

**Filtering vs. mastery (requirement 4).** Quiz and Study topic filters match a question via
`primaryTopic` **OR** any of its `secondaryTopics` (`questionService.buildQuestionQuery` builds an
`$or` over both fields). Mastery and weak-topic detection use `primaryTopic` **only**
(`topicMasteryService` never reads `secondaryTopics`). Both rules are tested:
`quizSessions.test.js`'s "updates the primary topic only (not secondary topics)" test proves the
mastery half; `adminQuestionTopics.test.js`'s topic-filter test proves a question is returned when
the filter topic matches only its `secondaryTopics`, not its `primaryTopic`.

**Hidden/thin topics (requirements 2–3).** `findDistinctTopics()` now does
`Question.distinct('primaryTopic')`, so a topic with zero primary questions (today, only Numbers &
Arithmetic) is automatically absent from the quiz/study topic-filter list and from the dashboard
mastery list — no special-case filtering was needed for either; both derive from the same query,
and a topic reappears in both automatically the moment it has ≥1 primary question. A topic with 1
to `MIN_QUESTIONS_FOR_MASTERY - 1` (today: Tuples at 1, Indexing & Slicing at 2) shows
`level: 'unavailable'` ("Not enough questions yet") — this already existed from the prior Phase 3
follow-up round and required no new code for the taxonomy revision, only the real counts to trigger
it.

**Migration script and a real bug found while running it.** `backend/scripts/migrateQuestionTopics.js`
reads the (already-updated) `backend/database/questions.json` as its source of truth and matches
each of the 47 live `Question` documents by its `code` field (verified unique across all 47, unlike
`question`, which is almost always shared boilerplate text) — this avoids any risk of a retyped
topic string being transcribed incorrectly. Run `--dry-run` first (47/47 matched, 0 unmatched), then
`--apply` against the confirmed-local dev database (`mongodb://127.0.0.1:27017/pyquiz`).

The first `--apply` run reported success but a follow-up direct query showed every document still
had its old `topics` field alongside the new `primaryTopic` — **`Model.updateOne()` (the
Mongoose-wrapped method) silently drops a `$unset` for a field no longer defined in the current
schema** (Mongoose's strict-update sanitization treats an unset of an unknown path as a no-op
rather than an error). Since `topics` had already been removed from `questionModel.js` by the time
the migration ran, every `$unset: { topics: '' }` was silently discarded. Fixed by switching that
one operation to `Question.collection.updateOne(...)` — the native MongoDB driver, which bypasses
Mongoose's schema-aware layer entirely. Re-ran `--apply`; verified directly: 0 documents retain
`topics`, 0 documents missing `primaryTopic`, and per-topic counts match the approved table exactly
(Lists 3, Names/Mutability/Identity 12, Strings 4, Data Types & Conversion 5, Loops & Control Flow
6, Sets 4, Dictionaries 6, Functions & Built-ins 4, Indexing & Slicing 2, Tuples 1, Numbers &
Arithmetic 0). `backend/database/questions.json` (the seed file) was updated with the same mapping
so a fresh seed matches the migrated database. This is now a comment directly in the migration
script as a warning for any future schema-narrowing migration in this codebase.

**Admin form restriction.** The admin add/edit question forms now use a required "Primary Topic"
`<select>` and an optional multi-select "Secondary Topics" (both populated from
`topicTaxonomy.js`'s full canonical list), replacing the old free-text comma-separated "Topics"
input. `questionValidators.js` rejects a `primaryTopic` outside the canonical list, rejects a
`primaryTopic`/`secondaryTopics` overlap on create, and (in `questionService.updateQuestion`, after
merging a PATCH payload with the stored document) rejects a PATCH that would create that overlap
against the *existing* primary or secondary topics — tested in `adminQuestionTopics.test.js`.

**Manual verification.** In addition to the automated tests, this migration was smoke-tested live
against the migrated dev database and dev frontend: quiz topic selection (10 topics shown, Numbers
& Arithmetic correctly absent), a quiz question's combined primary+secondary topic display, the
admin add-question form (primary/secondary selects), the manage-questions list/filter/edit views
(primary and secondary topic columns, pre-populated edit form), Study mode's card topic labels,
Daily Challenge's question topic label, and the dashboard's topic-mastery list (confirmed
"Indexing & Slicing" shows "Not enough questions yet" and Numbers & Arithmetic is absent). This
smoke test also surfaced a pre-existing, unrelated UI limit — `account.js`'s dashboard mastery list
capped itself at 8 topics (`mastery.slice(0, 8)`) when no topic had been attempted yet, which, now
that there are 10 real topics instead of the old free-text count, meant a brand-new user's
dashboard wouldn't show the last 2 alphabetically until they'd attempted at least one question in a
topic — fixed in the follow-up round below (the underlying API already returned all 10 correctly).

### Content gaps

Three canonical topics are below the healthy threshold for their own quiz/study filter to be
useful and are flagged here as a concrete backlog, each with a target of **at least 3 primary
questions**:

| Topic | Current primary questions | Target |
|---|---|---|
| Numbers & Arithmetic | 0 | ≥ 3 |
| Tuples | 1 | ≥ 3 |
| Indexing & Slicing | 2 | ≥ 3 |

Numbers & Arithmetic has no questions where arithmetic itself is the deciding concept (see the
proposal above for why); Tuples and Indexing & Slicing each have only the one or two questions
where the concept genuinely was the primary lesson once every question was re-read in full. Adding
new questions to close this gap is future work, not part of this round.

---

## Phase 3 follow-up — production migration safety and a dashboard fix (implemented, separate commit)

**`migrateQuestionTopics.js` now refuses to run against a partially-mappable database.** The
original script matched by `code` and simply skipped documents it couldn't match, still applying
the migration to everything else. Production is not guaranteed to be limited to the 47 seed
questions the mapping table covers — questions added through the admin panel afterwards, or any
question saved without a code snippet (`code` empty/undefined, which can never match a seed entry
by design), would be silently left without a `primaryTopic`, which the schema requires. The script
now:

- Lists every unmatched question in **both** the dry run and `--apply`, by `_id` and a truncated
  prompt, so each can be found and fixed in the admin panel.
- **Refuses to write anything** when any question is unmatched — `--apply` exits with a non-zero
  status and makes zero database calls in that case, rather than migrating a subset and leaving the
  rest schema-invalid.

Verified directly: a throwaway admin-panel-style question (no matching seed entry) was inserted
into the local dev database, confirmed to appear in the dry-run listing with its `_id` and prompt,
confirmed that `--apply` refused (exit code 1, zero documents changed) with it present, then
removed — the real 47 questions were otherwise unaffected throughout.

### Deployment checklist (production migration)

Superseded by the consolidated **"Production deployment checklist (all phases)"** at the end of
this document, which includes these migration steps in order alongside everything else a
production deploy needs.

**Dashboard mastery list no longer caps itself at 8 topics.** `account.js`'s `renderTopicMastery`
previously did `(attempted.length ? attempted : mastery).slice(0, 8)` — a leftover limit from when
the topic set was larger and unrelated to this migration, but now that there are exactly 10 real
canonical topics it meant a brand-new user (nothing yet attempted, so the `mastery` branch is used)
never saw the last 2 topics alphabetically. The `.slice(0, 8)` is removed; the list now always shows
every topic the mastery API returns — attempted topics only once the user has attempted something,
the full set before that. Verified live: a fresh user with zero attempts now sees all 10 topics on
their dashboard, including Strings and Tuples, which were previously cut off.

---

## Phase 4 addendum — security (implemented)

Decisions for this phase were made in advance by the project owner (listed per item below); nothing
here was a DECISION left open. Suite: 128 → 156 tests, 15 → 18 suites, all passing; `npm run lint`
and `npm run typecheck` clean.

**Item 10 — session invalidation.** `User.tokenVersion` (default 0) is embedded in every user and
admin JWT and compared on every authenticated request (`authenticateToken`, `optionalAuth`,
`verifyAdmin`, via `findValidSessionAccount`), which also rejects banned accounts. It is incremented
on ban (`userRepository.setBanned`, ban only — unbanning has nothing to invalidate), password change
(`userService.changePassword`) and password reset (`authService.resetPassword`). A token with no
`tokenVersion` claim (issued before this change) is treated as version 0, so deploying doesn't log
everyone out. Banned users were already rejected at login; a test now covers it alongside the three
invalidation cases (`tests/sessionSecurity.test.js`). A changed password now logs out the
current browser too; `settings.js` logs out and sends the user to `login.html?passwordChanged=1`.
The session lookup now only treats a malformed id (`CastError`) as "not logged in"; any other
failure goes to the error handler. Previously a blanket `catch` had hidden a missing repository
export, and every authenticated request failed silently.

**Item 11 — admin token storage. Decision: a separate httpOnly cookie with the same CSRF
scheme.** Before this change the admin JWT was returned in the login body, kept in
`localStorage.adminToken` and sent as a Bearer header. The trade-off:
- **localStorage + Bearer.** CSRF can't happen, because the browser never attaches the token
  automatically. But any XSS on any page of the frontend origin can read the token and take it
  away, giving an attacker a usable admin session for up to its full 1h lifetime from anywhere.
- **httpOnly cookie.** Script can't read the token at all, so XSS can at most act as the admin
  while the admin's page is open, and can't steal the session. The cost is CSRF exposure, because
  the cookie is sent automatically. That is mitigated by `SameSite=Lax` plus the HMAC-bound
  `X-CSRF-Token` check (item 12) on every state-changing admin route.

Now: `POST /api/v1/admin/login` sets `adminToken` (`__Host-adminToken` in production), httpOnly,
plus a readable `adminCsrfToken`, and returns no token in the body. `verifyAdmin` accepts
**only** that cookie: no Authorization header, and never the regular-user `token` cookie. It also
re-checks `role === 'admin'` in the database, so a demoted admin loses access immediately. Every
state-changing admin route (`PATCH /admin/users/:id/ban`, `PATCH`/`DELETE /admin/questions/:id`,
`POST /questions/add`) runs `verifyAdminCsrf`. New endpoints: `POST /api/v1/admin/logout` and
`GET /api/v1/admin/me`. Admin and user sessions are fully separate, so logging out of one leaves
the other alone. Every `localStorage` use of the admin token is gone from the frontend. Admin
pages now call `api.getAdminMe()` to decide whether to redirect, and `admin.html`'s inline
redirect script is now `/js/admin_entry.js`. **Breaking API change:** admin login no longer
returns `data.token`; the frontend was updated in the same change.

**Item 12 — CSRF and login-state detection.**
- *`__Host-` cookie prefix.* In production (`NODE_ENV=production`) all four cookies are
  `__Host-token`, `__Host-csrfToken`, `__Host-adminToken` and `__Host-adminCsrfToken`, with
  `Secure; Path=/` and no `Domain`. The browser then refuses any cookie of that name set by a
  sibling subdomain of picsartacademy.am, and the server reads only the prefixed names. A planted
  unprefixed `token` cookie is ignored in production (tested).
- *HMAC binding.* The CSRF token is `HMAC-SHA256(JWT_SECRET, "csrf:" + <session JWT>)`, not an
  independent random value. The server recomputes it from the httpOnly session cookie and compares
  it with `crypto.timingSafeEqual`. A planted matching cookie/header pair (the attack that defeats
  plain double-submit) and another session's token are both rejected (tested).
- *Local development over plain http.* Browsers refuse to store `__Host-` or `Secure` cookies over
  http, so outside production the cookies use the unprefixed names without `Secure`. `npm start`
  runs with `NODE_ENV=development`, so this needs no configuration, and `backend/env.example`
  documents it. Production must be served over HTTPS; over http the browser would silently drop
  the cookies and login would fail.
- *Cross-host frontend.* The frontend is configured to call `https://api-pyquiz.picsartacademy.am`,
  a different host from the page. A host-only (and so `__Host-`) CSRF cookie set by the API can
  never be read from the page's `document.cookie`, and this was already true for the old
  unprefixed cookie. So login and `GET /me` now also return `csrfToken` in the response body.
  `api.js` keeps it in memory for the page, fetches it from `/me` when the cookie isn't readable,
  and never persists it to web storage. A browser check with the CSRF cookie removed confirmed
  that mutations still succeed.
- *Login-state detection.* New `GET /api/v1/auth/me` endpoint. `requireAuth()`, the header, the
  sidebar, `index.js` and the quiz start button all now ask the server, through a per-page
  memoized `getSession()`, instead of checking whether a readable cookie exists. A 401 from any
  non-login, non-`/me` endpoint clears client-side session state and redirects to the matching
  login page. The CSRF cookie's `expires` already matched the 1h JWT (unchanged).

**Item 13 — contact auto-reply. Decision: dropped entirely.** `sendContactEmail` now sends one
email, to the admin address only. The message is still saved and the admin is still notified.
Since no email goes to a submitter-supplied address, the global daily cap is moot. Tested with
nodemailer mocked: one `sendMail` call, addressed to `EMAIL_USER`.

**Item 14 — reset tokens.** Only `sha256(resetKey)` is stored (`ResetPassword.resetKeyHash`). The
plaintext key exists only in the emailed link. On reset the stored hash is compared with
`crypto.timingSafeEqual` after the lookup. A test reads the raw collection and asserts the key
itself appears nowhere in it. Reset links issued before deployment stop working, since they have
no hash stored; they expire after 1h anyway.

**Item 15 — `/metrics`, `/api-docs`, `trust proxy`.**
- In production, `GET /metrics` requires `Authorization: Bearer $METRICS_TOKEN`, compared in
  constant time. With no token configured it returns 404 (fails closed). It stays open outside
  production.
- `/api-docs` is not mounted in production unless `ENABLE_API_DOCS=true`.
- `trust proxy` was already configured from `TRUST_PROXY` and documented in the Pre-Phase-3 fixes;
  no change was needed.
- All three variables are documented in `backend/env.example`, and all cases are tested
  (`tests/productionExposure.test.js`).

**Helmet / Content-Security-Policy.**
- *Backend.* Explicit CSP with `script-src 'self'`: Swagger UI loads its scripts as external
  files. `style-src` allows `'unsafe-inline'` for Swagger's inline `<style>`, and
  `frame-ancestors 'none'` is set.
- *Frontend.* `frontend/app.js` now uses Helmet (`helmet` added to `frontend/package.json`) with a
  CSP compatible with every page:
  - `script-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com` (Prism.js on Study,
    Font Awesome on admin contacts), `script-src-attr 'none'`, and **no `'unsafe-inline'` for
    scripts**.
  - `connect-src` is exactly the local and production API origins that `/js/config.js` hands out.
  - Google Fonts are allowed in `style-src` and `font-src`, and `data:` images for avatars.
  - `upgrade-insecure-requests` and HSTS are applied only in production.
- *Inline code moved out for the CSP.*
  - The inline theme bootstrap duplicated in every page's `<head>` is now `/js/theme-init.js`
    (still loaded synchronously, so there's no theme flash).
  - `admin.html`'s inline redirect is now `/js/admin_entry.js`.
  - Inline `onclick=` attributes were replaced by `addEventListener` bindings (password toggles on
    login, registration and reset-password; the forgot-password button) and by a delegated handler
    in `questions.js` for the result-screen buttons.
  - The runtime API config was already an external `/js/config.js` route.
- `style-src` keeps `'unsafe-inline'`, a deliberate and documented exception. Pages and rendered
  templates use `style=""` attributes, and Font Awesome's script injects a `<style>` element.
  Style injection is a far smaller risk than script injection.
- Verified in headless Chrome against a throwaway local backend, frontend and database: user
  login, logged-in header and sidebar, user and admin mutations, admin login and logout, a ban
  invalidating the live session, the stale-session redirect, and every page loaded with **zero CSP
  violations or JS exceptions**.

**Noticed, not changed (out of Phase 4 scope):** `frontend/public/js/about.js` fetches
`/api/v1/questions/study?limit=1` without credentials, presumably to show a count. That endpoint
has required auth since Phase 2, so the request always gets a 401.

---

## Production deployment checklist (all phases)

The single ordered list for deploying the work in this branch (Phases 1–4 and the follow-ups) to
production. It supersedes the migration-only checklist in the Phase 3 follow-up section. So far
everything here has only been run against the local development database. Nothing in this branch
has been run against production.

**Before the deploy**

1. **HTTPS end to end.** Both the frontend and the API must be served over HTTPS. In production
   the session and CSRF cookies are `__Host-`-prefixed and `Secure`, and browsers silently refuse
   them over plain http, so login would fail with no error.
2. **Set the backend environment** (`backend/env.example` documents each variable):
   - `NODE_ENV=production`. `npm run prod` sets this; set it yourself if the process is started
     any other way.
   - `MONGODB_URI`: the production connection string. `MONGO_URI` is still read as a fallback, with
     a startup warning; rename it when you can.
   - `JWT_SECRET`: required, and the app exits without it. Changing it also invalidates every
     session and CSRF token.
   - `DAILY_CHALLENGE_SEED_SECRET`: required for the Daily Challenge (503 without it). Keep it
     stable, because changing it changes the question set of every day not yet frozen.
   - `TRUST_PROXY`: the **exact number** of reverse-proxy hops in front of the API (e.g. `1` for
     one load balancer or nginx). Never `true`, which lets clients spoof their IP and bypass every
     rate limiter. Leave it unset only if nothing sits in front of the app.
   - `METRICS_TOKEN`: a long random value. Without it `/metrics` returns 404 in production. Give it
     to whatever scrapes metrics as `Authorization: Bearer <token>`.
   - `CLIENT_URI`: the exact frontend origin, e.g. `https://pyquiz.picsartacademy.am`. It is the
     CORS allow-list entry, and the base of password-reset links.
   - `EMAIL_USER` / `EMAIL_PASS`: needed for password-reset and contact emails.
   - Optional: `ENABLE_API_DOCS` (leave unset to keep `/api-docs` off), `REDIS_URL` (response
     caching), `LOG_LEVEL`, `PORT`, `API_URI`.
3. **Set the frontend environment:** `NODE_ENV=production` (enables HSTS and
   `upgrade-insecure-requests` in its CSP). Set `PRODUCTION_API_URL` only if the API is not at
   `https://api-pyquiz.picsartacademy.am`. That origin is also the CSP `connect-src`.
4. **Back up the production database** with a full snapshot or export, and confirm it can be
   restored. The topic migration below performs an `$unset` that can't be undone without it.

**Database steps (in this order, against production, each dry run first)**

5. **Username backfill:** `node backend/scripts/backfillUsernameLower.js`, read the output, then
   `--apply`. It is idempotent and renames nothing.
6. **Username collisions:** `node backend/scripts/reportDuplicateUsernames.js` (report-only).
   If it lists case-insensitive duplicates, decide whether `--apply` (rename all but the oldest
   account in each group) is acceptable, or resolve them by hand. Repeat until it reports none.
7. **Topic migration dry run:** `node backend/scripts/migrateQuestionTopics.js`, and read the
   output in full.
8. **Resolve every unmatched question** it lists (e.g. questions added through the admin panel)
   by setting a `primaryTopic` by hand, until a fresh dry run reports zero unmatched.
9. **Apply the topic migration:** `--apply`. It refuses to run while anything is unmatched.
   - Not part of the deploy: `backend/scripts/resetFarmedPoints.js`. By the owner's Phase 1
     decision, existing points are left untouched.

**The deploy**

10. **Deploy backend and frontend together**, not one after the other. Several API shapes
    changed:
    - `POST /users/user-progress` was removed.
    - Topics moved from `topics` to `primaryTopic`/`secondaryTopics`.
    - Admin login no longer returns a token.
    - Login now uses the `/auth/me` session check.
    - Every page uses `/js/theme-init.js`.
11. **Cache-bust every changed frontend file.** There is no build step, so add a version query
    string (e.g. `api.js?v=<commit>`) to each `<script src>`/`<link href>` whose file changed.
    `git diff --name-only <deployed-commit> HEAD -- frontend/public frontend/views` lists them.
    Returning users must not run cached old JS against the new API.

**Expected effects to communicate**

12. **Every user and admin is logged out once.** In production the cookie names change from
    `token`/`csrfToken` to their `__Host-` versions, and the admin session moves from localStorage
    to a cookie, so existing sessions are not recognised. Everyone just logs in again.
13. **Outstanding password-reset links stop working.** Only hashes are stored now, and links sent
    before the deploy have no stored hash. They would have expired within 1h anyway, and users
    can request a new link.
14. Topic accuracy history starts at the Phase 1 deployment (`AnswerEvent` didn't exist before),
    and a user who finished a Daily Challenge in the 20:00–23:59 UTC window on deploy day may
    complete one more that day (see Pre-Phase-3 note 3).

**After the deploy (smoke test)**

15. From outside the network, check each of the following:
    - `GET https://<api>/api/v1/questions/stats` returns counts.
    - `GET /metrics` returns 401 without the token and 200 with it.
    - `GET /api-docs/` returns 404.
    - A response from the frontend carries the `Content-Security-Policy` header.
    - `Origin: https://evil.example` on `GET /api/v1/auth/me` gets no
      `Access-Control-Allow-Origin` back.
16. In a browser with a normal account:
    - Register (or use a test account), log in, and confirm the cookies are `__Host-token` and
      `__Host-csrfToken`.
    - Change something in Settings, and play one Classic quiz and the Daily Challenge.
    - Check that the About page shows the question and topic counts.
    - Log out, then confirm a protected page redirects to login.
17. Admin: log in and confirm the `__Host-adminToken` cookie and nothing in localStorage. Edit a
    question, ban and unban a test account, then log out.
18. Request a password reset for a test account and confirm the email arrives and the link works.
    Submit the contact form, and confirm only the admin receives an email.
19. Watch the backend logs for `MONGO_URI is deprecated`, `TRUST_PROXY=true`, and 4xx/5xx spikes
    during the first hour.

---

## Phase 5 addendum — testing and tooling (implemented)

Owner's decisions for this phase:
- report real line and branch coverage;
- a minimal Playwright suite that also covers the About page and login/logout;
- Swagger annotations for every endpoint;
- skip the BullMQ email queue and leave it as documented future work;
- a `benchmark.js` that can only target localhost or an explicitly passed URL, run once locally with
  the numbers, machine and dataset recorded.

### Coverage (real numbers, `cd backend && npm run test:coverage`)

`jest.config.js` previously collected coverage only from `controllers/`, `services/` and
`middleware/`. It now covers all runtime code: `app.js`, `config`, `controllers`, `core`, `docs`,
`jobs`, `middleware`, `models`, `observability`, `repositories`, `routes`, `services`, `utils` and
`validators`. It excludes `scripts/` and `database/`, which are one-off CLI migration and seed tools
run by hand. The "before" numbers come from checking out `d8ad91e` (the Phase 0 audit commit, before
any fix) and running the same config, so both columns measure the same file set.

| | Before (`d8ad91e`) | After (this commit) |
|---|---|---|
| Tests / suites | 89 / 9 | 187 / 23 |
| Lines | 77.69% (763/982) | 89.37% (1304/1459) |
| Branches | 50.39% (191/379) | 74.66% (495/663) |
| Statements | 77.19% (775/1004) | 89.08% (1331/1494) |
| Functions | 72.57% (127/175) | 89.72% (227/253) |

The least-covered files are `jobs/emailQueue.js` and `jobs/queue.js` at 0%, since BullMQ is unused
without `REDIS_URL` and was skipped this phase, followed by `middleware/cache.js` (31.8% lines) and
`config/redis.js` (50%). Both of those only run with Redis configured, which the test suite doesn't
set up.

### Playwright smoke suite (`cd e2e && npm install && npm test`)

A self-contained `e2e/` package using `@playwright/test`. It runs on the locally installed Google
Chrome (`channel: 'chrome'`); remove that line and run `npx playwright install chromium` to use
bundled Chromium instead.
- **Servers.** It starts its own backend (port 7598) and frontend (port 3998), so running dev servers
  are untouched.
- **Database.** The backend uses a dedicated local `pyquiz_e2e` database, which `e2e/start-backend.js`
  drops and re-seeds from `questions.json` on every run. It refuses to run against anything that
  isn't a local `*_e2e` database.
- **Checks.** Every test fails on any Content-Security-Policy violation or uncaught page error.

Seven tests, all passing (three consecutive runs, 27–41 s each):
1. Guest quiz flow.
2. Login shows the logged-in state; logout ends the session, and a protected page then redirects to
   login.
3. A logged-in Classic quiz.
4. Completing the Daily Challenge.
5. The theme toggle switches and persists across a reload.
6. The About page shows the live counts from `/questions/stats`.
7. The cross-host CSRF case: log in, delete the readable `csrfToken` cookie, reload, and a
   state-changing request still succeeds because the token is re-fetched from `/auth/me`.

### Swagger (`/api-docs`)

Every endpoint is annotated: 40 operations on 37 paths, from `@openapi` blocks above each route in
`backend/routes/v1/*.js`, plus `/healthz`, `/readyz` and `/metrics` defined in `docs/swagger.js`.
The docs include security schemes for the user cookie, the admin cookie, the CSRF header and the
metrics bearer token. Request schemas are derived from the Zod validators, and the topic and mode
enums are built from config.

`tests/swagger.test.js` derives the real route list by walking the Express router stacks. It asserts
that the spec and the routes match in both directions, so an undocumented or stale route fails the
suite. It also checks that the spec is valid OpenAPI 3: `$ref`s resolve, path parameters are
declared and required, and operation ids are unique. `GET /` and a legacy redirect are deliberately
undocumented.

In the webpack bundle (`dist/server.js`), swagger-jsdoc reads the route files from disk relative to
`dist/`. So `/api-docs` is only populated when the source `routes/` folder is deployed alongside the
bundle; without it the page loads with just the three operational paths.

### Build and typecheck, stated plainly

- **Webpack:** `npm run build` bundles `app.js` and its dependencies into a single `dist/server.js`,
  so production starts from one file (`npm run prod`). Its `production` mode also bakes
  `NODE_ENV === 'production'` into the bundle.
- **`tsc --noEmit`:** runs with `allowJs: true` but `checkJs: false`, so it is **not** JSDoc type
  checking. It parses the 114 JS files and catches syntax errors only. There are no `.ts` files.
  Enabling `checkJs` currently reports 1,564 errors, so it's future work rather than a flag to flip.
- The same explanation is in comments in `webpack.config.js` and `tsconfig.json`.

### BullMQ email queue: skipped (owner's decision)

Documented future work. `backend/jobs/queue.js` and `backend/jobs/emailQueue.js` exist, but emails
are sent synchronously. The intended change is to enqueue password-reset and contact emails when
`REDIS_URL` is set, falling back to synchronous sending otherwise.

### Benchmark (`cd backend && npm run benchmark -- --url <target>`)

`backend/scripts/benchmark.js` uses autocannon. It prints requests, average req/s, p50/p90/p99/max
latency, non-2xx and error counts for:
- `GET /questions/random` (question fetch);
- `POST /quiz/sessions/:id/answer` (answer submit): a fixed number of answers, one per quiz session,
  with the sessions created before the timed run;
- `GET /users/leaderboard`;
- `GET /users/me` and `GET /users/topic-mastery`, the two calls the dashboard makes.

**Target safety.** The default is `http://localhost:7498`. The target is never read from an
environment variable, any other target must be passed with `--url`, and a non-local URL prints a
warning.

**Rate limits.** The run registers a throwaway user and writes quiz data. The rate limiters would
answer most benchmark requests with 429, so the target backend runs with
`BENCHMARK_DISABLE_RATE_LIMITS=true`. The new `config/rateLimitBypass.js` honours this only when
`NODE_ENV` isn't `production`, re-checks it on every request, and logs an error if it's set in
production. `tests/rateLimitBypass.test.js` covers unset, development and production.

**Recorded run (2026-09-30 12:19 +04, one run, not averaged):**

| Endpoint | Requests | Avg req/s | p50 ms | p90 ms | p99 ms | max ms | non-2xx |
|---|---|---|---|---|---|---|---|
| `GET /questions/random` | 22,323 | 2,233 | 4 | 6 | 9 | 19 | 0 |
| `POST /quiz/sessions/:id/answer` | 2,000 | 125 | 75 | 102 | 125 | 137 | 0 |
| `GET /users/leaderboard` | 25,727 | 2,339 | 4 | 5 | 7 | 13 | 0 |
| `GET /users/me` | 22,752 | 2,276 | 4 | 5 | 7 | 40 | 0 |
| `GET /users/topic-mastery` | 25,219 | 2,293 | 4 | 5 | 7 | 12 | 0 |

- **Settings:** 10 connections; each GET ran for 10 s, and the answer-submit run was a fixed 2,000
  requests.
- **Machine:** Intel Core i7-6700HQ @ 2.60 GHz (8 logical cores), 16 GB RAM, macOS 12.7.6, Node
  v20.11.0, MongoDB 7.0.15 on the same machine (127.0.0.1), autocannon 8.0.0. The client, API and
  database all ran on one laptop, which also had the developer's own backend dev server and editor
  running.
- **Backend configuration:** `NODE_ENV=development`, no Redis (so no response caching),
  `LOG_LEVEL=error`, rate limits bypassed.
- **Dataset:** a fresh local database seeded with the 47 questions (10 visible topics). It had 2
  users, both benchmark users, one from a 3 s trial run just before. So the leaderboard ranked 2
  users, and `topic-mastery` computed over the benchmark user's own answer history, 2,000
  `AnswerEvent`s by the time it ran. That's far smaller than a real user base, and leaderboard
  numbers in particular say nothing about behaviour with thousands of users. The database was
  dropped afterwards.
- **Reading the numbers:** answer submit is the write path (session update, `AnswerEvent`,
  `UserAnsweredQuestion`, stats), about 20× slower per request than the reads here. These figures
  are for this machine and dataset only, not a production capacity estimate.

### Found while annotating every endpoint (reported, not changed in this phase)

The first five were confirmed directly against the code:
1. **Daily Challenge answers are publicly queryable.** `POST /api/v1/questions/:id/check` needs no
   authentication. With `reveal: true` it returns `correctAnswer`, `correctIndex` and `explanation`
   for any question id, today's Daily Challenge questions included. Even without `reveal`, trying
   `selectedIndex` 0–3 reveals which option is correct. That undoes the Phase 2 intent behind
   making Study mode login-only and excluding the day's set. The frontend doesn't call this
   endpoint (`api.checkAnswer` is defined but unused), so removing it, or requiring login and
   excluding today's set, would close it.
2. `checkAnswerSchema.reveal` uses `z.coerce.boolean()`, so the string `"false"` parses as `true`.
3. `express.json()` uses its default 100 kB body limit, while the avatar field allows 500,000
   characters. Large avatars get a 413 before validation runs.
4. Registration and reset accept any characters (plus the required classes), but change-password
   only allows `[A-Za-z\d@$!%*?&_]`. A password containing `#` can be registered but not set via
   change-password.
5. Admin login returns 404 "Admin not found" for an unknown username and 401 for a wrong password,
   so it reveals which admin usernames exist.
6. Reported by the annotation pass but not separately re-verified:
   - `verifyAdmin` returns 403 with no cookie but 401 for an invalid token.
   - Auth middleware and limiters return `{ error }` rather than the standard envelope.
   - User auth still accepts an `Authorization: Bearer` header, which the CSRF checks don't account
     for.
   - Quiz routes run `optionalAuthenticate` twice (once globally, once per route).
   - Contact and Daily Challenge submit validation live outside `validators/`.
   - Leaderboard `limit` has no Zod schema (the service clamps it).
