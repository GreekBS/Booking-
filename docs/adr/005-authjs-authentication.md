# ADR-005: Authentication with Auth.js v5

## Status
Accepted

## Context
Phase 1 requires user authentication supporting credentials and OAuth (Google), session management with active tenant context, and integration with the Prisma adapter for user/account/session persistence.

## Decision
Use Auth.js v5 (NextAuth) with:
- Database session strategy for revocable sessions and `activeTenantId` on sessions
- Prisma adapter mapping to `users`, `accounts`, `sessions`, `verification_tokens`
- Credentials provider with bcrypt password verification
- Google OAuth provider with email account linking disabled
- Application use cases for registration, email verification, and password reset (tokens in `verification_tokens`)

## Consequences
- Auth configuration lives in `apps/web/lib/auth` (presentation/infrastructure boundary)
- Domain auth logic is expressed as use cases with ports (`IPasswordHasher`, `IVerificationTokenRepository`)
- Email delivery remains stubbed in Phase 1 (console logs) per product scope
