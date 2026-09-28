# PyQuiz: An Interactive Platform for Python Knowledge Assessment and Practice

**A description of the current implementation, prepared for thesis documentation**

Repository: https://github.com/HaykuhiMk/PyQuiz
Live application: https://pyquiz.picsartacademy.am/

---

## 1. Project Overview

PyQuiz is a full-stack web application designed to help learners test, practice, and track their knowledge of the Python programming language through interactive, multiple-choice quizzes. The platform combines several complementary modes of engagement — timed and untimed quizzes, a self-paced study mode, a daily shared challenge, and a competitive leaderboard — with a personal dashboard that records a user's progress, accuracy, streaks, and mastery of individual topics over time.

The system is built as a client–server web application: a Node.js/Express backend exposes a versioned REST API backed by a MongoDB database, and a browser-based frontend consumes that API to present quizzes, results, and account information. The application supports both registered users, whose progress and statistics are persisted across sessions, and anonymous guests, who can attempt quizzes immediately without creating an account, at the cost of not having their results saved.

PyQuiz's intended users are primarily learners of Python — students in a course, self-taught programmers, or candidates preparing for technical interviews — who want a lightweight, focused tool for checking their understanding of language fundamentals (data types, control flow, data structures, string and list operations, object semantics, and related topics) rather than a full programming environment or a graded course platform. A secondary audience is anyone maintaining or extending the platform itself, including through its administrative panel, which allows the question bank and user base to be managed without direct database access.

## 2. Motivation and Problem Statement

Verifying one's own understanding of a programming language is harder than it sounds. Reading documentation or tutorials produces a feeling of familiarity that does not always correspond to an ability to predict, under time pressure and without hints, what a given piece of code will actually do. Many learners discover gaps in their understanding only when they are least prepared to address them — during an interview, an exam, or a real debugging session — because casual, untimed reading rarely exposes those gaps in advance.

Conventional self-assessment approaches have several limitations that a dedicated platform can address. Static quizzes distributed as PDFs or printed worksheets offer no immediate feedback and no way to track improvement over time. General-purpose quiz tools are often not tailored to a specific subject and provide no structured way to see which sub-topics are actually weak versus which are solid. Purely social or leaderboard-driven coding platforms tend to emphasize competition over structured review, offering little support for a learner who first wants to consolidate fundamentals before testing themselves against others.

PyQuiz is motivated by the idea that a single, focused tool — scoped specifically to Python knowledge, with immediate server-verified feedback, more than one mode of practice (self-paced, timed, and high-stakes), and a persistent, per-topic record of performance — gives a learner a more honest and more actionable picture of where they stand than any of these alternatives on their own. Because scoring and answer verification are always performed on the server rather than trusted from the client, a user's results are meaningful rather than a display convention.

## 3. Project Goals and Objectives

The overarching goal of PyQuiz is to provide a reliable, secure, and pleasant platform for practicing and assessing Python knowledge through short, well-explained multiple-choice questions, while giving learners visibility into their own progress over time.

Within the current implementation, this goal has been pursued through the following concrete objectives, each of which corresponds to functionality that is genuinely present in the codebase (and detailed further in Section 4):

- Provide account-based access with secure registration, login, logout, and password recovery, alongside a zero-friction guest mode for immediate, unauthenticated practice.
- Offer more than one way to engage with the question bank — self-paced practice, a countdown-timed mode, and a single-mistake "survival" mode — so that the same content can be used for casual review as well as for pressure-testing recall.
- Guarantee that scoring cannot be manipulated from the browser by keeping the correct answer, its index, and its explanation on the server until a question is answered correctly or explicitly revealed.
- Give every registered user a personal dashboard summarizing total points, current and best streaks, overall accuracy, progress through the question bank, and — importantly — a breakdown of performance by topic, so that "how am I doing overall" can be refined into "which specific topics need more attention."
- Introduce lightweight, transparent gamification (a fixed set of achievements, a points system, and a public leaderboard) to encourage sustained practice without turning the platform into a game disconnected from its educational purpose.
- Offer a daily, identical-for-everyone challenge that creates a light sense of routine and enables fair, same-day comparison between users.
- Provide a study mode that shows questions together with their correct answers and explanations up front, separating "assessment" (where the answer is withheld) from "review" (where it is not).
- Build the necessary administrative tooling — question management, user moderation, and visibility into contact-form submissions — so that the platform's content and user base can be maintained in practice, not only in theory.
- Apply security practices appropriate to a system that stores user credentials and personal statistics: password hashing, JWT-based authentication, CSRF protection on state-changing requests, input validation on every endpoint that accepts one, and rate limiting on authentication-sensitive routes.
- Present all of the above through a responsive, theme-aware (light/dark) interface that remains usable on both desktop and mobile screens and follows basic accessibility practices (keyboard operability, visible focus states, semantic landmarks).

## 4. System Functionality

This section describes, in turn, each area of functionality that is implemented in the current codebase.

### 4.1 User Registration, Authentication, and Guest Access

New users register with a username, email address, and password. The backend enforces a minimum-complexity password policy (at least eight characters, including an uppercase letter, a lowercase letter, a digit, and one of a defined set of special characters) and rejects registration if the email address is already in use. Passwords are never stored in plain text; they are hashed with `bcryptjs` before being persisted.

Login exchanges an email and password for a signed JSON Web Token (JWT), which the server places in an `httpOnly` cookie rather than returning it as plain JSON — this means the token itself is never directly accessible to page JavaScript, which limits the impact of a cross-site scripting vulnerability elsewhere on the site. A second, readable cookie carrying a random CSRF token is set alongside it; its presence or absence in the browser is what the frontend uses to determine, without contacting the server, whether a user is currently signed in.

Alongside authenticated access, PyQuiz supports a **guest mode**: clicking "Continue as guest" on the landing page sets a plain, client-side cookie and takes the visitor directly into the quiz flow, with no account required. Guests can take Classic, Blitz, and Survival quizzes and can browse the Study mode and the Leaderboard, but any page that depends on a persisted account — the Dashboard, the Daily Challenge, and Settings — redirects a guest to the login page, since there is no account to attach that data to. The interface makes the guest/authenticated distinction explicit: quiz screens display a visible "Guest Mode — progress isn't saved" notice, and the results screen after a quiz quietly omits the points/XP statistic for guests instead of showing a fabricated or always-zero number.

Password recovery is a separate, token-based flow: a user who has forgotten their password requests a reset link by email; the server always responds with the same generic acknowledgement regardless of whether that email actually exists in the system, which prevents the endpoint from being used to enumerate registered accounts. If the email does correspond to a real user, a single-use reset token is generated, stored with a one-hour expiry, and emailed as a link; visiting that link lets the user set a new password, after which the token is deleted.

### 4.2 Python Quizzes and Available Quiz Modes

The core of the platform is its multiple-choice Python quiz. A user first chooses a mode (Classic, Blitz, or Survival — described in full in Section 5), optionally narrows the question pool by difficulty and by one or more topics, and then answers questions drawn from that filtered pool one at a time. Each question presents its prompt, an optional Python code snippet (rendered with syntax highlighting), and a set of answer options identified by letter. Submitting an answer sends only the selected option's index to the server, which is the only place where the correct answer is known; the response indicates whether the choice was correct and, only in that case (or when the answer is explicitly revealed), also returns the correct option and a short explanation of why it is correct.

### 4.3 Question Categories and Difficulty Levels

Every question in the database is tagged with one or more topics (for example, "Lists," "Dictionaries," "Loops," "String Formatting," or "Mutability") and with exactly one difficulty level — easy, medium, or hard. These tags drive the topic and difficulty filters available when starting a quiz or a study session, and they are also the basis for the per-topic mastery statistics described below. The bundled seed dataset currently contains 47 questions spanning 92 distinct topic tags (a question is commonly tagged with several related topics) and a difficulty split of 25 easy, 18 medium, and 4 hard questions; this reflects the size of the dataset shipped with the project rather than a limit built into the platform itself, since new questions can be added at any time through the administrative panel.

### 4.4 Study Mode and Learning Resources

Study mode presents the same underlying question bank, filterable by topic search and difficulty, but as a paginated list of cards that show the question, its code (if any), its options with the correct one already marked, and its explanation — all at once, with no scoring involved. It exists specifically for review rather than assessment: a learner who wants to read through material on a given topic, rather than test their recall of it under quiz conditions, uses Study mode instead of a quiz.

### 4.5 Daily Challenge

The Daily Challenge gives every signed-in user the same five questions on a given calendar day. The set of questions is not chosen at random on each request; it is derived deterministically from the date using a seeded, cryptographic shuffle of the entire question bank, so that every user who opens the Daily Challenge on the same day sees the identical five questions, but the selection still changes from day to day without needing to be curated by hand. A user answers all five questions and submits them together in a single request; the server scores the submission, and a user may only complete a given day's challenge once — a second submission attempt is rejected. Each correct answer in the Daily Challenge is worth a fixed 20 points, deliberately higher than a single question answered in an ordinary quiz, which gives the daily routine a small but real incentive beyond novelty.

### 4.6 Results, Scoring, and Performance Feedback

At the end of a quiz session (or immediately, in Survival mode, after the first mistake), the user is shown a results screen summarizing their performance for that session: the number of questions answered, the number correct, the resulting accuracy percentage, the best streak of consecutive correct answers achieved during the session, and — for signed-in users — the running total of points on their account. A compact, color-coded strip ("ribbon") also visually replays the sequence of correct and incorrect answers across the session. Every individual answer, correct or not, also gives immediate feedback in place: the chosen option is marked, and on a correct answer (or after revealing the answer) the correct option and a written explanation are shown before moving on.

### 4.7 User Dashboard and Progress Tracking

Signed-in users have a dashboard that consolidates their standing on the platform: total points, a computed rank label (Beginner, Intermediate, Advanced, or "Python Master," based on point thresholds), current and best answer streaks, overall accuracy, and progress through the question bank expressed as "questions answered out of questions available." The dashboard also surfaces the user's Daily Challenge status for the day and their unlocked achievements, and links directly into starting a new quiz, so that the dashboard functions as the natural home screen of the application for a returning user.

### 4.8 Topic Mastery and Weak-Topic Identification

Beyond the account-wide statistics, PyQuiz computes a **per-topic mastery** breakdown for each user. For every topic present in the question bank, the system computes two independent measures from real recorded data: *coverage* (the percentage of that topic's questions the user has ever answered) and *accuracy* (the percentage of the user's attempts on that topic that were correct, drawn from per-topic counters updated after every answer). Each topic is then classified into one of four levels — "new," "beginner," "intermediate," or "master" — using thresholds on coverage and accuracy, and the resulting list is presented on the dashboard, most-covered topics first. Topics where the user has made a meaningful number of attempts (at least two) but whose accuracy remains below 60% are additionally surfaced as a short "needs practice" list of up to five topics, intended to point a learner toward exactly where more review would help. Both the mastery list and the weak-topics list are computed on demand from real recorded data; nothing in this feature is randomized or fabricated, and a brand-new user with no answered questions correctly sees every topic as "not started" rather than misleading placeholder progress.

### 4.9 Achievements, Points, Streaks, and Gamification

The platform recognizes five fixed achievements — answering a first question correctly, reaching a five-answer streak, reaching a ten-answer streak, accumulating 100 total points, and accumulating 500 total points — each evaluated automatically on the server every time a user answers a question, and unlocked (with a timestamp) the moment its condition is first met. Points are awarded only for correct answers, and the amount depends on the quiz mode: 10 points in Classic mode, 15 in Survival mode, and 12 points in Blitz mode plus a small time bonus (up to 10 additional points) that rewards answering with time to spare. A "streak" in this context is the number of consecutive correct answers a user currently has going; it resets to zero on any incorrect answer, and both the current and the best-ever streak are tracked on the account.

### 4.10 Leaderboard

A global leaderboard ranks all users by total accumulated points (with best streak and total correct answers shown alongside), and is publicly viewable — it does not require authentication to load, since seeing where the top performers stand does not depend on being one of them. When viewed by a signed-in user, the leaderboard also highlights that user's own row, so they can immediately see how their score compares to others without hunting for their name in the list.

### 4.11 User Settings and Account Management

The Settings page lets a signed-in user update their display name, upload or remove a profile photo (stored as a size-limited base64-encoded image after client-side and server-side size checks), change their password (which requires re-entering the current password and satisfies the same complexity policy enforced at registration), choose their preferred light or dark theme explicitly, and permanently delete their own account and all associated progress after re-entering their password for confirmation. Administrator accounts are explicitly excluded from self-deletion through this page.

### 4.12 Administrative Functionality

A separate administrative area, reachable through its own login page and authenticated independently of the regular user session (see Section 9), allows an administrator to manage the platform's content and user base directly:

- **Question management** — listing questions with the same topic/difficulty filters used elsewhere, viewing a single question in full (including its answer and explanation), adding new questions, editing existing ones (with the invariant that the designated correct answer must always be one of the listed options, enforced on both creation and update), and deleting questions.
- **User management** — listing registered users and toggling a ban flag on a specific account, with a safeguard that prevents an administrator account from being banned through this interface.
- **Contact message review** — a paginated, read-only view of messages submitted through the public contact form, so that inbound inquiries can be reviewed from within the application rather than only through the recipient email inbox.

### 4.13 Other Relevant Features Discovered During Codebase Analysis

A public **contact form** lets any visitor send a message, which is persisted to the database, emailed to the site's administrator address, and acknowledged with an automatic reply email to the sender. The submission form includes an invisible "honeypot" field: if it is filled in (which only an automated script, not a human, would do), the request is silently accepted without ever touching the database or sending any email, which quietly discards spam without revealing to the sender that it was detected. The endpoint is additionally rate-limited to a small number of submissions per client per time window.

The backend also exposes a small set of **operational endpoints** that are not part of the quiz functionality itself but support running the system reliably: a `/healthz` liveness check, a `/readyz` readiness check that reflects the actual database connection state, a Prometheus-compatible `/metrics` endpoint for monitoring, and a Swagger/OpenAPI UI mounted at `/api-docs` (its base schema is served, though endpoint-level documentation has not yet been written into the route files — see Section 12).

## 5. Quiz Modes and Assessment Methodology

PyQuiz implements three distinct quiz modes, all drawing from the same question bank and filters but differing in pacing and consequence:

**Classic mode** is untimed and forgiving: a wrong answer does not end the session, and a user may try again on the same question up to three times before a "Show Answer" option appears, which reveals the correct answer and its explanation and counts the question as answered without further guessing. In this mode, questions the user has already answered correctly (or given up on) within their account are excluded from being served again in the same run, so a Classic session moves progressively through unseen questions rather than repeating them.

**Blitz mode** adds a 45-second countdown per question, measured against a wall-clock deadline (so that switching browser tabs or a slow device cannot be used to extend the time). Submitting a wrong answer in Blitz does not end the round; it pauses the countdown at the exact time remaining and resumes from there in the same question on the next attempt, rather than restarting the clock. If time runs out before a correct answer is given, the question is automatically scored as incorrect and the quiz moves on to the next question. Correct answers in Blitz earn a small bonus on top of the base points for answering quickly.

**Survival mode** is the strictest: the first incorrect answer ends the run immediately and takes the user directly to the results screen, with no retries and no reveal. This mode is intended to simulate the higher-stakes conditions of an interview or exam question, where a single mistake has a real consequence, rather than the low-stakes repetition of Classic mode.

Across all three modes, the platform's answer-checking is always performed by the server, never by comparing the selected option against a value already present in the browser: the client sends only the index of the option it selected, and the server independently determines correctness by looking up the question's stored answer and computing which option index matches it. The correct answer's text, its index, and its written explanation are included in the server's response only when the answer given was correct, or when the user has explicitly asked to reveal it (in Classic mode, after exhausting the allowed attempts) — a wrong guess in Survival mode, for instance, never has the correct answer disclosed to the client, since the run ends before a reveal is requested. This design means the quiz's scoring cannot be defeated by inspecting network traffic or modifying client-side JavaScript.

Results are always computed from the same underlying data regardless of mode — the count of questions answered, the count answered correctly, and the resulting accuracy — with mode-specific framing (a "Survival run ended" versus a "Session complete" message, for instance) applied only to the presentation, not to how the numbers themselves are derived.

## 6. System Architecture

PyQuiz follows a conventional client–server architecture composed of two independently deployable Node.js applications — a backend API server and a frontend static-file server — communicating exclusively over HTTP.

The **backend** is organized as a layered Express application:

- **Routes** (`backend/routes/v1/*`) declare the available HTTP endpoints, group them under a versioned `/api/v1` prefix, and attach the middleware relevant to each one (authentication, CSRF verification, request validation, or admin verification) before delegating to a controller.
- **Controllers** (`backend/controllers/*`) are thin adapters between an HTTP request/response pair and the underlying business logic; they extract the relevant input, call into a service, and translate the result (or a thrown error) into a standardized JSON response.
- **Services** (`backend/services/*`) contain the actual business logic — authentication rules, scoring, achievement evaluation, daily-challenge generation, topic-mastery computation, and so on — independent of any HTTP-specific concerns.
- **Repositories** (`backend/repositories/*`) isolate all direct interaction with Mongoose models behind a small, purpose-specific set of functions (for example, `findByEmail`, `markAnswered`, `findLeaderboard`), so that services do not construct database queries directly.
- **Models** (`backend/models/*`) define the MongoDB collections and their schemas via Mongoose (described in full in Section 8).

Cutting across these layers, a set of Express **middleware** modules handle authentication token verification, the CSRF double-submit check, Zod-based request validation, admin-token verification, and (optionally) response caching. Centralized error handling converts any thrown error into a consistent JSON error shape, logs it with request context via a structured logger, and — critically — never leaks an unexpected internal error's message to the client, returning a generic "Internal server error" for anything that is not a recognized, intentional application error.

The **frontend** is deliberately implemented without a client-side framework or a build/bundling step: it is a collection of static HTML pages, each with its own small, page-specific vanilla JavaScript module, served by a minimal Express application whose only job is to serve static files and to dynamically inject a handful of shared HTML partials — a navigation header for public pages, a persistent sidebar for the authenticated application, and a shared footer — into every page at load time via `fetch` and DOM insertion, rather than through server-side templating or a component framework. All communication with the backend happens through a single shared `api.js` module that wraps `fetch`, attaches the CSRF header on state-changing requests, and normalizes error handling for every page.

The two applications communicate purely as an HTTP client and an HTTP API: the frontend never talks to MongoDB directly, and the backend has no knowledge of how its JSON responses are rendered. This separation means the same backend could serve a different frontend (or the existing frontend could be replaced) without changes to the other side, and it is what makes it possible for the two to be deployed and scaled independently, as the project's own local-development instructions do (`frontend` and `backend` run as two separate `npm` processes on two separate ports).

## 7. Technology Stack

**Backend**

- **Node.js** with **Express 4** as the web framework.
- **MongoDB**, accessed through **Mongoose** as the object-document mapper, for all persistent data.
- **JSON Web Tokens** (`jsonwebtoken`) for authentication, combined with **`cookie-parser`** for reading the resulting cookies and **`bcryptjs`** for password hashing.
- **Zod** for schema-based request validation across virtually every endpoint that accepts a body, query string, or route parameter.
- **Helmet** for standard HTTP security headers and **`cors`** for cross-origin access control.
- **`express-rate-limit`** for per-route rate limiting.
- **Nodemailer**, configured against a Gmail SMTP account, for outbound email (password-reset links and contact-form notifications).
- **`ioredis`** and **BullMQ** as optional infrastructure for Redis-backed response caching and a background email-job queue, both designed to be inert (no-ops) when no `REDIS_URL` is configured.
- **Pino** (with `pino-http` and, in development, `pino-pretty`) for structured, redaction-aware logging.
- **`prom-client`** for exposing Prometheus metrics, and **`swagger-jsdoc`**/**`swagger-ui-express`** for serving an OpenAPI documentation UI.
- **Jest** and **Supertest** for automated testing, with **`mongodb-memory-server`** providing an isolated, disposable database for the test suite.
- **Webpack** as the production build tool (via a `build` script that bundles the backend into a `dist/` output run by the `prod` script).
- **ESLint**, **Prettier**, **Husky**, and **`lint-staged`** for code quality and pre-commit enforcement, and **TypeScript**'s compiler used purely for type-checking (`tsc --noEmit`) rather than as the implementation language.

**Frontend**

- Plain **HTML5**, **CSS3**, and vanilla (framework-free) **JavaScript** using native ES modules.
- A minimal **Express** application whose sole responsibilities are serving static assets and generating a small runtime configuration script that tells the browser which API origin to call.
- **Prism.js**, loaded from a CDN, for client-side syntax highlighting of the Python code snippets shown in questions.
- No frontend build step, bundler, or UI framework is used; all interactivity is hand-written DOM manipulation.

## 8. Database and Data Management

PyQuiz uses MongoDB as its sole data store, with the following Mongoose-defined collections forming the core data model:

**`User`** is the central entity. Alongside credentials (username, email, hashed password) and a `role` field distinguishing ordinary users from administrators, each user document embeds a `stats` sub-document (current streak, best streak, total points, total correct answers, total questions answered, per-mode best scores for Blitz and Survival, and the timestamp of the last answer), an `achievements` array (each entry a unique key plus the date it was unlocked), a `dailyChallenge` sub-document (the date, score, total, and completion timestamp of the most recent daily attempt), and a `topicStats` array recording, per topic the user has attempted, how many questions in that topic were answered and how many of those were correct. A compound index on `stats.totalPoints` and `stats.bestStreak` supports efficient leaderboard queries.

**`Question`** stores the quiz content itself: the prompt text, an optional code snippet, the array of answer options, the single correct answer (stored as text and matched against the options array rather than as a separate index, so that reordering options never desynchronizes the stored answer), a difficulty enum, an array of topic tags, and an explanation. Indexes on difficulty and on topics (individually and combined) support the filtered and random-selection queries used throughout the quiz, study, and daily-challenge features.

**`UserAnsweredQuestion`** is a join-style collection recording, for each (user, question) pair, that the question has been answered, with a unique compound index on the pair so that marking the same question answered twice is a harmless no-op rather than a growing, duplicated record. This collection — rather than an ever-growing array on the `User` document — is what lets Classic mode efficiently exclude already-seen questions and lets the platform compute total "answered" versus "unanswered" counts and topic coverage without loading a user's entire answer history into memory each time.

**`ResetPassword`** stores a password-reset token together with the associated email and a creation timestamp; a MongoDB TTL index automatically deletes the document one hour after creation, so an expired reset link fails validation simply because its token no longer exists in the database, with no separate expiry-checking logic required.

**`Contact`** stores each contact-form submission (name, email, message, and timestamp) for later review through the admin panel.

Relationships between these entities are expressed through referenced ObjectIds (for example, `UserAnsweredQuestion.userId` references `User`) rather than through embedding every related record inside a single document, which keeps the `User` document itself bounded in size regardless of how many questions a long-time user has answered. Aggregate statistics that would otherwise require scanning large collections on every request — such as topic mastery, which in principle depends on every question and every answered-question record — are computed on demand at request time from the smaller, indexed collections described above rather than being pre-materialized, trading a small amount of per-request computation for always-current, storage-light results.

## 9. Security and Reliability

Because PyQuiz stores real user credentials, personal statistics, and an administrative surface capable of modifying content and banning users, its implementation includes several concrete, verifiable security measures rather than relying on obscurity or a single control.

**Authentication.** Regular-user sessions are backed by a JWT stored in an `httpOnly` cookie (inaccessible to page JavaScript) with a one-hour expiry, marked `Secure` when the server runs with `NODE_ENV=production` and always sent with `SameSite=Lax`. Passwords are hashed with `bcryptjs` before storage and are never logged (the structured logger explicitly redacts the `Authorization` header, the `Cookie` header, the CSRF header, and any `Set-Cookie` response header). Administrator authentication is deliberately kept separate and simpler in one important respect: it is issued and verified **only** as a Bearer token in the `Authorization` header, never as a cookie, specifically so that an admin session cannot be silently forged by a cross-site request the way a cookie-based session could be — the admin middleware (`verifyAdmin`) does not accept a cookie at all, even though the same JWT-decoding logic is shared with the regular-user path.

**Cross-site request forgery protection.** State-changing requests made by a signed-in regular user (updating progress, changing settings, deleting an account, and so on) are protected by a double-submit-cookie CSRF scheme: on login, the server sets a second, readable cookie containing a random token; the frontend reads that cookie and echoes its value back as an `X-CSRF-Token` header on every non-safe (non-GET) request; the server rejects the request unless the header matches the cookie. Because a cross-origin attacker cannot read cookies set for this site, it cannot reproduce the matching header value, even though the browser would still attach the cookie itself to a forged request.

**Input validation.** Nearly every endpoint that accepts a request body, query string, or route parameter validates it against an explicit Zod schema before any business logic runs — covering registration and login payloads, password-reset requests, quiz-progress updates, profile updates, password changes, account deletion, question creation and editing, question-filter and pagination query parameters, and contact-form submissions. Requests that fail validation are rejected with a 400 status and a description of what was wrong, without reaching the corresponding service or repository code.

**Rate limiting.** A general rate limiter caps all API traffic at 300 requests per 15 minutes per client. Independently, each authentication-sensitive endpoint — admin login, user login, registration, and both steps of password reset — has its **own** rate limiter instance (rather than one limiter shared across all of them), so that exhausting the limit on one endpoint does not lock a client out of unrelated ones. The contact form has a separate, stricter limit of five submissions per 15 minutes.

**Other protections.** The contact form includes a honeypot field to silently discard automated spam submissions without revealing that detection occurred. The password-reset-request endpoint returns an identical response whether or not the submitted email corresponds to a real account, preventing it from being used to enumerate registered users. Avatar uploads are validated to be `data:image/` URLs under a fixed size limit both before being sent (in the browser) and again on the server. Administrator accounts are explicitly protected from being banned or deleted through the ordinary user-facing endpoints. `Helmet` applies a standard set of protective HTTP response headers, and CORS is restricted to an explicit allow-list of origins with credentials enabled only for those origins.

**Error handling and reliability.** All errors funnel through a single centralized handler that distinguishes between intentional, client-facing application errors (which keep their specific message and any structured details) and anything else, which is logged in full internally but reported to the client only as a generic "Internal server error" — so a stack trace, a database error message, or other internal detail is never exposed over the API. The backend also exposes `/healthz` and `/readyz` endpoints (the latter reflecting the real MongoDB connection state) suitable for use by a process manager or orchestrator, structured JSON logging in production, and a `/metrics` endpoint compatible with Prometheus scraping — infrastructure oriented toward operating the service reliably rather than toward the quiz functionality itself.

It should be stated plainly what is *not* currently implemented: there is no email-verification step at registration (an account is usable immediately), no refresh-token mechanism (a session simply expires after one hour, requiring a fresh login), and no two-factor authentication. These are reasonable and common gaps for a project at this stage, discussed further as future opportunities in Section 13, and are noted here so that the security measures described above are not overstated.

## 10. User Experience and Interface Design

PyQuiz's interface is built around a single, hand-authored design system rather than a third-party CSS framework, applied consistently across the quiz, dashboard, results, and navigation. The visual language favors square and sharply cut ("chamfered") corners over generic rounded panels as a recognizable, consistent motif, reserves a distinct warm accent color specifically for success and achievement moments (a correct answer, an unlocked achievement, a completed streak) rather than using it as a general-purpose highlight color, and uses a cooler brand-blue palette for ordinary interactive elements.

The interface supports both **light and dark themes**, switchable from a toggle present in both the navigation bar and the Settings page. The chosen theme is persisted in the browser's local storage and re-applied on every subsequent visit; a first-time visitor with no stored preference instead sees whichever theme matches their operating system's `prefers-color-scheme` setting, so the platform respects an explicit choice once one is made but otherwise defers to the visitor's own system.

Navigation differs deliberately between the public, unauthenticated pages (the landing page, login, registration, and informational pages such as About and Contact) and the authenticated application pages (the Dashboard, Quiz, Daily Challenge, Study, Leaderboard, and Settings). Public pages use a conventional horizontal top navigation bar. Authenticated pages instead use a persistent left-hand sidebar on wider screens, which collapses on narrow (mobile) viewports into a slide-out drawer opened from a compact top strip; the drawer can be dismissed with the Escape key, by tapping its background overlay, or via its own close control, and keeps keyboard focus inside itself while open so that a keyboard user tabbing through the page cannot accidentally tab into content hidden behind the open drawer.

A number of concrete accessibility practices are present in the markup and stylesheets rather than being only a design aspiration: interactive icon-only controls (the theme toggle, the drawer's open/close buttons) carry explicit `aria-label` attributes describing what they do; the current page is marked in the navigation using `aria-current` rather than color alone; asynchronous status changes (a quiz loading, a form submitting, an error occurring) are announced through `aria-live` regions so that a screen-reader user is informed of them without having to search the page; every interactive element has a visible focus outline (`:focus-visible`) so keyboard navigation remains usable; and animations — including the confetti celebration shown on completing a quiz — are skipped entirely when the browser reports a `prefers-reduced-motion` preference, rather than merely being shortened.

The layout is responsive throughout: quiz cards, the dashboard's statistic tiles, the leaderboard table, and the navigation itself all adapt their arrangement at defined breakpoints rather than assuming a single fixed viewport width, and the sidebar-to-drawer behavior described above is itself a direct response to narrow screens rather than a separate mobile-only interface.

## 11. Educational Value and Practical Applications

As implemented, PyQuiz is most directly useful as a tool for **independent, self-directed learning**: a learner working through a Python course or textbook can use Study mode to review a specific topic's questions and explanations at their own pace, then use Classic-mode quizzes on the same topics to test recall without the safety net of seeing the answer immediately, and finally consult their per-topic mastery breakdown on the dashboard to decide, with some objectivity, whether that topic actually needs more attention or was already solid.

The platform's timed and high-stakes modes give it a secondary, more specific use as light **interview or exam preparation**: Blitz mode's per-question countdown approximates the time pressure of a timed technical screening, and Survival mode's single-mistake rule approximates the unforgiving nature of a live coding interview question, where there is no "try again" once an answer has been given. Neither mode simulates an actual interview conversation — there is no open-ended coding or spoken-response component in the current system — but as multiple-choice pressure tests of language fundamentals, they serve a genuine preparatory purpose distinct from Classic mode's low-stakes review.

The Daily Challenge and Leaderboard together support a lighter, habit-forming use case: because the daily set of questions is identical for every user on a given day, it functions as a small, fair, shared exercise that a group of learners (classmates, or participants in the same course) could compare notes on, and the leaderboard gives continued practice a visible, if informal, sense of progress relative to others.

Finally, because the platform's administrative tooling allows new questions to be added and existing ones edited without touching the database directly, PyQuiz is also usable as a **teaching aid that an instructor could extend**, populating the question bank with material specific to a particular course or curriculum rather than relying solely on its bundled dataset.

## 12. Current Limitations

Several aspects of the current implementation are genuine, acknowledged limitations rather than failures of the system to do what it sets out to do; they mark natural boundaries of the present version rather than defects in it.

- **Question bank size.** The bundled dataset currently contains 47 questions, with only four tagged as "hard" difficulty. This is sufficient to demonstrate every feature described in this document, but a learner using the platform extensively would exhaust the pool of unseen questions in a given topic or difficulty relatively quickly; the administrative panel exists specifically so that this content can be grown over time, but growing it is a manual, ongoing task rather than something the current system does automatically.
- **No adaptive difficulty or content selection.** Although the platform already computes detailed per-topic mastery and identifies weak topics (Section 4.8), this information is currently presented to the user for their own manual decision-making; it is not yet used to automatically steer which questions, topics, or difficulty levels a user is shown next. Difficulty and topic selection remain filters that the user sets explicitly before a quiz begins.
- **No artificial intelligence or machine learning component.** Every scoring, matching, and recommendation mechanism described in this document — answer checking, streaks, points, topic mastery, weak-topic detection, the daily-challenge selection, and the leaderboard — is deterministic logic implemented directly in the backend's service layer. No language model, machine-learning library, or external AI service is invoked anywhere in the current codebase. In particular, there is no implemented "AI Interviewer" or conversational assessment feature; any such capability remains a proposal for future work (Section 13) and should not be understood as already present.
- **Email delivery is synchronous and single-provider.** Password-reset and contact-form emails are sent directly within the HTTP request that triggers them, using a single Gmail account via Nodemailer, rather than through a dedicated transactional email service or a background job. A BullMQ/Redis-backed email queue module exists in the codebase and is designed to degrade gracefully when Redis is not configured, but it is not currently invoked by either the password-reset or contact-form code paths — it is present as groundwork for future use, not as an active part of the email flow today.
- **API documentation is scaffolded but not populated.** A Swagger/OpenAPI UI is served at `/api-docs`, but the specification it generates currently contains only base schema information; individual routes are not yet annotated with the JSDoc comments Swagger would need to document their parameters and responses in detail.
- **No email verification or multi-factor authentication.** An account becomes fully usable immediately upon registration, without confirming ownership of the supplied email address, and there is no optional second authentication factor.
- **Fixed-length sessions.** Authentication tokens expire after a fixed one hour with no silent renewal mechanism; a user who remains on the site past that point must sign in again the next time an authenticated action is attempted.
- **Automated testing covers the backend only.** The project's 89 automated tests (across nine Jest test suites, using Supertest against an in-memory MongoDB instance) exercise the backend's authentication, question, admin, contact, daily-challenge, and progress-scoring logic; there is no equivalent automated test suite for the frontend.
- **Client-side leaderboard-row identification is heuristic.** Because the leaderboard API does not return a stable per-row user identifier, the frontend identifies "which row belongs to the current viewer" by matching username and statistics together and only highlights a row when that match is unambiguous, which means two users who happened to share an identical username and identical statistics at the same moment would not have their row highlighted at all, rather than the wrong one being highlighted.

## 13. Future Development Opportunities

The items below are proposals for extending PyQuiz beyond its current implementation. None of them exist in the codebase today; they are included to indicate a credible and, in most cases, incrementally reachable direction for further work, building on functionality — such as the topic-mastery data already being collected — that the current system has already put in place.

- **AI Interviewer.** A conversational practice mode in which a language model plays the role of a technical interviewer, asking open-ended follow-up questions in response to a user's explanations rather than presenting only fixed multiple-choice options. This is the most substantial proposed extension and would require integrating an external or self-hosted language model, designing a safe and bounded conversation flow, and deciding how (or whether) such a free-form interaction could be scored consistently. It does not exist in the current system in any form.
- **Adaptive, data-driven assessment.** Using the mastery and weak-topic data that the platform already computes (Section 4.8) to automatically bias which questions, topics, or difficulty levels a user is shown, rather than leaving that decision entirely to manual filters — for example, weighting a user's next Classic-mode session toward topics currently below a mastery threshold.
- **Expanded and richer question content**, including a substantially larger question bank, support for short free-text or fill-in-the-blank answers in addition to multiple choice, and coverage of additional languages or frameworks beyond core Python.
- **Account security hardening**, including email verification at registration, optional two-factor authentication, and a refresh-token mechanism that would allow a session to be renewed silently rather than requiring re-authentication every hour.
- **Completing the operational tooling already scaffolded in the codebase**, specifically wiring the existing BullMQ/Redis queue into actual password-reset and contact-form email delivery, and populating the Swagger/OpenAPI documentation with per-endpoint annotations.
- **Frontend automated testing**, to bring the same level of regression protection currently enjoyed by the backend to the browser-side code.
- **Social or collaborative features**, such as private groups or classrooms with their own leaderboards, shareable results, or head-to-head timed matches between two specific users rather than only the global leaderboard.
- **Progress export**, allowing a user to download or share a summary of their accuracy, streaks, and topic mastery — useful, for instance, as supporting material in a job application or a course portfolio.

## 14. Conclusion

In its current form, PyQuiz is a complete, working full-stack application for practicing and assessing Python knowledge, not a prototype limited to a single demonstrable path. It implements secure account-based authentication alongside a genuinely usable guest mode; three distinct, differently-paced quiz modes with all scoring verified server-side; a daily shared challenge; a self-paced study mode; a personal dashboard with real, per-topic mastery analytics rather than only aggregate statistics; a transparent points, streak, and achievement system; a public leaderboard; user-facing account management; and an administrative panel sufficient to operate the platform's content and user base going forward. These features are supported by concrete, verifiable security practices — hashed passwords, cookie-based sessions protected against cross-site request forgery, comprehensive input validation, layered rate limiting, and centralized error handling that does not leak internal details — and by a consistent, theme-aware, and accessibility-conscious interface built without reliance on a heavyweight frontend framework.

Equally important to a fair account of the system is what it does not yet do: it contains no artificial intelligence or adaptive algorithm, its question bank is modest in size, and several pieces of supporting infrastructure (asynchronous email delivery, populated API documentation) exist as groundwork rather than active functionality. Making these limitations explicit, alongside a working system that already delivers real educational value, is itself a demonstration of the project's engineering maturity, and it sets a concrete, well-scoped foundation — particularly the already-collected topic-mastery data and the layered backend architecture — on which the proposed future directions, including a genuinely adaptive assessment engine and an AI-assisted interview mode, could be built without first needing to redesign what already exists.
