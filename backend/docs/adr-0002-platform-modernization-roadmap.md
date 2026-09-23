# ADR-0002: Platform modernization roadmap

## Status
Proposed

## Context
PyQuiz needs stronger engagement loops, scalable frontend architecture, and hardened security/reliability controls.

## Decision
Adopt a phased modernization plan:

1. Engagement engine (implemented)
   - Timed modes metadata (`classic`, `blitz`, `survival`)
   - Streak tracking, achievements, and global leaderboard API
2. Frontend modernization (planned)
   - Migrate frontend to Next.js (React)
   - Use TanStack Query for server state and Zustand/Redux Toolkit for client state
3. Contract-first backend/client (planned)
   - Keep REST with `/api/v1` as source of truth
   - Generate typed client SDK from OpenAPI spec in CI
4. Security and reliability hardening (in progress)
   - Health/readiness endpoints and graceful shutdown implemented
   - Next: refresh token rotation, CSRF protection for cookie auth, admin MFA, RBAC scopes, audit logging, and Mongo backup/restore automation
5. UX/UI system (planned)
   - Introduce design tokens, reusable components, WCAG 2.1 AA checks, and mobile-first quiz interactions

## Consequences
- Delivers immediate engagement improvements without a full rewrite.
- Keeps existing APIs compatible while guiding migration toward a typed and scalable platform.
