# Phase 1 Architecture Audit

## Remaining architecture violations

- `apps/web/lib/auth/options.ts` — uses Prisma directly (allowed in DI/auth boundary override).
- `apps/web/middleware.ts` — uses Auth.js session (presentation concern, acceptable).
- Email delivery remains console stub (Phase 1 approved scope).

## Remaining TODOs

- None in source (`grep TODO` clean in packages/apps).

## Test coverage

| Suite | Location | Status |
|-------|----------|--------|
| Domain unit | `packages/domain` | 20 tests |
| Database unit | `packages/database/tests/*.test.ts` | 5 tests |
| Repository integration | `packages/database/tests/integration` | requires PostgreSQL |
| RLS verification | `tests/integration/rls.integration.test.ts` | requires migrated DB |
| Outbox integration | included in repository integration tests | requires PostgreSQL |
| Playwright E2E | `apps/web/tests/e2e` | requires running web + DB |
| ESLint boundaries | `scripts/verify-eslint-boundaries.mjs` | fixture-based |

## Production readiness

- Migrations: `prisma/migrations/20250626120000_init` includes RLS policies.
- `setTenantContext` parameterized with UUID validation.
- Audit logging in use-case layer only.
- Outbox pattern via `IOutboxRepository`.
- CSRF, rate limiting, structured logging present in auth routes.

## DDD compliance

- Aggregates emit domain events; repositories persist via ports.
- Use cases orchestrate; route handlers are thin.
- `IIdGenerator` removes Node crypto from domain layer.

## Clean Architecture compliance

- Domain has zero infrastructure imports.
- Presentation imports use cases via DI container only.
- Database package implements domain ports.

## Phase 1 acceptance checklist

| Criterion | Status |
|-----------|--------|
| Prisma migrations + RLS | Implemented — verify with live DB |
| SQL injection fix in tenant context | Done |
| ArchivePropertyUseCase | Done |
| No domain orchestration in routes | Done |
| IAmenityRepository + use cases | Done |
| No direct Prisma in presentation routes | Done |
| IOutboxRepository | Done |
| ESLint boundary enforcement | Wired — verify with lint:architecture |
| ADR-005/006/007 | Documented |
| Platform tenant PATCH | Done |
| Member PATCH/DELETE | Done |
| Unit CRUD API | Done |
| Property policy updates | Done |
| Tenant admin provisioning | Done |
| Role/revoke audit logging | Done (use-case layer) |
| Auth flows (register/reset/verify/Google UI) | Done (email stub) |
| Integration + E2E tests | Implemented — execution depends on PostgreSQL |
