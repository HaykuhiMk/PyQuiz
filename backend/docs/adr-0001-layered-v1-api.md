# ADR-0001: Introduce Layered `v1` API

## Status
Accepted

## Context
The original backend mixed business logic in routes and lacked a consistent response/error contract.

## Decision
- Add a layered path for new endpoints:
  - routes -> controllers -> services -> repositories -> models
- Introduce versioned endpoints under `/api/v1/*`.
- Standardize response shape:
  - success: `{ success: true, data, error: null, meta }`
  - error: `{ success: false, data: null, error: { message, details }, meta }`
- Add request validation middleware using Zod.

## Consequences
- Existing `/api/*` endpoints remain backward compatible.
- New features should be added to `/api/v1/*` only.
- Future migration can deprecate old endpoints after frontend adopts `v1`.
