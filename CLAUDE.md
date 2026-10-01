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
- Verify question answers: `cd backend && npm run verify-questions` (runs every seed snippet on each
  available Python, requires python3; reference versions in `config/pythonVersion.js`)

## Ground rules

- Keep the layered architecture (routes → controllers → services → repositories → models) and Zod
  validation for every new input. Do not introduce a frontend framework or build step.
- Every behavioral fix needs at least one new Jest/Supertest test proving it. All existing tests
  must keep passing unless a test encodes behavior deliberately being changed (say why in the
  commit message).
- Don't change unrelated code, reformat files, or upgrade dependencies unless a fix requires it.
- Never run a migration script or any one-off script against the production database — local dev
  only (`mongodb://127.0.0.1:27017/pyquiz`), always dry-run first when a script supports it.

## Production data

- **The production database is in v2 format** (converted 2026-10-01 with
  `backend/scripts/productionMigration.js`) and is the source of truth for question content. The
  owner edits content there, in the admin panel.
- **Claude Code never connects to the production database or server**, by any route: not port
  27018 (the owner's SSH tunnel), not the server, not any remote host.
- **Real-data work happens only on local copies.** The owner restores them from backups in
  `~/pyquiz-backups` into a local database (e.g. `pyquiz_verify`, `pyquiz_realcopy`):
  - restore with `--nsFrom='pyquiz.*' --nsTo='<copy>.*'`, because the backups' database is named
    `pyquiz`, the same name as the local dev database;
  - **never commit, copy or move those backups**, or anything derived from them that holds
    personal data.
- **Never print, log, save or commit personal data** (emails, usernames, password hashes, message
  contents) from those copies. Report counts, ids and question content only. Throwaway test
  accounts in a copy are deleted afterwards.
- **Fix scripts meant for production** live in `backend/scripts/` (e.g. `lowercaseEmails.js`,
  using `scripts/lib/uriScript.js`). They take the connection string **only** from `--uri` (never
  `.env`), print the target first, dry run by default, and ask for the database name to be typed
  on `--apply`. Claude tests them on a local copy; **the owner runs them on production.**
- Never invent data, measurements, citations, or benchmark numbers. Where something only the
  project owner can provide is needed, insert a `TODO(author): ...` placeholder instead.
- Keep temporary/scratch files (one-off scripts, intermediate data dumps) in the repo's `tmp/`
  directory (gitignored) — never in `/tmp` or elsewhere outside the repo.

## Where things stand

The audit/remediation (`fix/review-weaknesses`) is merged. Then came the concept graph
(`feature/concept-graph`), the production conversion and the real-data audit
(`fix/real-data-audit`, current). Read `docs/FIX_PLAN.md` first: its status section and
"Deployment preparation" record the decisions made. The other docs:
- `docs/DEPLOY_RUNBOOK.md`: the owner's production steps;
- `docs/CONTENT_FIXES.md`: the question fixes;
- `docs/CONCEPT_GRAPH.md`: the concept graph;
- `docs/AUDIT.md`: the original findings and history.
