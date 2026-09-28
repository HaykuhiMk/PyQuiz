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
