# PyQuiz

PyQuiz is a full-stack Python quiz platform: a Node.js/Express 4 + MongoDB/Mongoose backend
(`/backend`) following routes → controllers → services → repositories → models, and a
framework-free vanilla JS frontend (`/frontend`, served as static HTML/JS with no build step).
Backend endpoints are validated with Zod and errors go through a centralized error handler.

## Commands

- Backend dev server: `cd backend && npm start` (nodemon, port from `.env`, default 7498)
- Frontend server: `cd frontend && npm start` (plain Express static server, default port 3000)
- Backend tests: `cd backend && npm test` (Jest + Supertest, `--runInBand`); coverage: `npm run test:coverage`
- Lint: `cd backend && npm run lint`
- Typecheck: `cd backend && npm run typecheck` (`tsc --noEmit`, `checkJs` off: syntax check only)
- Frontend smoke tests: `cd e2e && npm install && npm test` (Playwright; own servers + local `pyquiz_e2e` DB)
- Benchmark: `cd backend && npm run benchmark -- --url <local API>` (see docs/AUDIT.md Phase 5)
- Seed local dev DB: `cd backend && npm run seed` (reads `database/questions.json`)

## Ground rules

- Keep the layered architecture (routes → controllers → services → repositories → models) and Zod
  validation for every new input. Do not introduce a frontend framework or build step.
- Every behavioral fix needs at least one new Jest/Supertest test proving it. All existing tests
  must keep passing unless a test encodes behavior deliberately being changed (say why in the
  commit message).
- Don't change unrelated code, reformat files, or upgrade dependencies unless a fix requires it.
- Never run a migration script or any one-off script against the production database — local dev
  only (`mongodb://127.0.0.1:27017/pyquiz`), always dry-run first when a script supports it.
- Never invent data, measurements, citations, or benchmark numbers. Where something only the
  project owner can provide is needed, insert a `TODO(author): ...` placeholder instead.
- Keep temporary/scratch files (one-off scripts, intermediate data dumps) in the repo's `tmp/`
  directory (gitignored) — never in `/tmp` or elsewhere outside the repo.

## Where things stand

Ongoing audit/remediation work lives on branch `fix/review-weaknesses`. Read `docs/FIX_PLAN.md`
(current phase, decisions made, remaining instructions) and `docs/AUDIT.md` (full findings and
implementation history) before continuing that work.
