# PyQuiz

PyQuiz is a full-stack quiz platform for practicing Python MCQs.

## Project Structure

- `frontend/`: static pages and browser scripts
- `backend/`: REST API, auth, admin, password reset, contact

Both services are independent Node.js apps and run on separate ports.

## Features

- Registration, login and guest mode
- Quiz modes: Classic, Blitz (45 seconds per question) and Survival
- Topic and difficulty filters, with answers checked on the server
- Daily challenge, study mode and a global leaderboard
- Dashboard with points, streaks, topic mastery and achievements
- Light and dark themes (follows the system setting until you choose one)
- Forgot/reset password flow and a contact form with email delivery
- Admin panel for questions, users and contact messages

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript, Express static server
- Backend: Node.js, Express, MongoDB (Mongoose), JWT
- Security middleware: Helmet, CORS, rate limiting

## Local Setup

1. Clone repository:

```bash
git clone https://github.com/HaykuhiMk/PyQuiz.git
cd PyQuiz
```

2. Install dependencies:

```bash
cd backend && npm install
cd ../frontend && npm install
```

3. Configure environment variables.

Create `backend/.env` (see `backend/env.example`):

```env
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
CLIENT_URI=http://localhost:3000
EMAIL_USER=your_email
EMAIL_PASS=your_email_password
```

`MONGODB_URI` is the single setting that controls which database the backend
connects to — there is nothing else to change in code to switch databases:

- **Local development:** point it at a local MongoDB instance, e.g.
  `mongodb://127.0.0.1:27017/pyquiz`.
- **Production:** point it at your hosted database, e.g. a MongoDB Atlas
  connection string such as
  `mongodb+srv://<username>:<password>@<cluster-host>/<database>`.

The previous name, `MONGO_URI`, is still accepted as a fallback (the
backend logs a deprecation warning at startup), so an existing deployment
that still sets `MONGO_URI` keeps working until it is renamed.

Enter the real value only in your local `backend/.env` file (which is
git-ignored and never committed) — `backend/env.example` must keep only a
placeholder, never real credentials.

`frontend/.env` is optional:

```env
PORT=3000
API_URL=http://localhost:7498
```

4. Run both services:

```bash
cd backend && npm start
cd ../frontend && npm start
```

`npm start` in `backend/` runs the development server on port 7498 (or `PORT`). If `MONGODB_URI` can't be reached it falls back to an in-memory MongoDB, and it seeds the questions from `database/questions.json` into an empty database.

5. Open [http://localhost:3000](http://localhost:3000).

## Notes

- The frontend serves `/js/config.js` from `frontend/app.js`: on `localhost`/`127.0.0.1` it points the browser at `API_URL` (default `http://localhost:7498`), elsewhere at `PRODUCTION_API_URL` (default `https://api-pyquiz.picsartacademy.am`).
- Versioned API is available at `/api/v1/*` with standardized response format.
- Swagger docs are served at `/api-docs` and Prometheus metrics at `/metrics` on the backend.
- In production, run the backend with `NODE_ENV=production` (`npm run build && npm run prod`) so auth cookies are marked `Secure` and logs are JSON, and set `CLIENT_URI` to the frontend's URL: it is the allowed CORS origin and the base of password-reset links.

## Backend Quality Tooling

In `backend/`:

- `npm run lint`
- `npm run test` (set `MONGOMS_VERSION=7.0.15` if the bundled in-memory MongoDB binary won't start on your machine)
- `npm run test:coverage` — the same suite with line/branch coverage (`coverage/`, gitignored)
- `npm run typecheck` — `tsc --noEmit` with `checkJs` off, i.e. a syntax check of the JS sources, not type checking
- `npm run benchmark -- --url http://localhost:<port>` — autocannon latency/throughput for the main endpoints; defaults to `http://localhost:7498` and never reads its target from env. Start the target backend with `BENCHMARK_DISABLE_RATE_LIMITS=true` (ignored in production) and a throwaway database — it registers a user and writes quiz data.
- `npm run verify-questions` — runs every seed question's code snippet on each available Python version (requires `python3`; finds every `python3`/`python3.N` on `PATH`, or set `PYQUIZ_PYTHONS=/path/a:/path/b`) and reports any answer that doesn't match the real output. The reference versions are in `backend/config/pythonVersion.js`; `-- --require-checked` also fails if one of them isn't available.
- `npm run build`

## Frontend smoke tests

```bash
cd e2e && npm install && npm test
```

A minimal Playwright suite (guest quiz, login/logout, Classic quiz, Daily Challenge, theme toggle,
About page, CSRF recovery after reload). It starts its own backend on port 7598 and frontend on
port 3998 against a local `pyquiz_e2e` MongoDB database that it drops and re-seeds on every run, so
it needs a local MongoDB on `127.0.0.1:27017` and never touches your dev data. Locally it
uses your installed Google Chrome (the `chrome` project in `e2e/playwright.config.js`). With
`CI=true` it has a `chromium`, `firefox` and `webkit` project instead, using Playwright's own
browsers (`npx playwright install <browser>`); run one with `npx playwright test --project firefox`.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request, on GitHub-hosted `ubuntu-latest`
runners only. It uses no secrets, deploys nothing, and can only read the repository
(`permissions: contents: read`). Three jobs run in parallel:

- **Backend:** `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`, with a throwaway
  MongoDB 7.0 service container.
- **Question answers:** `npm run verify-questions -- --require-checked` with Python 3.9 and 3.14
  (exactly those two, through `PYQUIZ_PYTHONS`). It fails if either is missing.
- **Playwright:** the full suite once per browser, in Chromium, Firefox and WebKit, each with its own
  MongoDB service container. The traces of failed tests are kept as an artifact for 7 days.

A newer push to the same branch cancels the older run. The tests need no `.env`: the Jest suites
and `e2e/start-backend.js` set throwaway values for everything they use, and mail is off.

## License

MIT





