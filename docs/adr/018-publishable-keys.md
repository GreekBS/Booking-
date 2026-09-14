# ADR-018: Publishable Keys

## Status
Accepted

## Context
Storefront clients run in untrusted browsers. They need tenant-scoped credentials that are safe to embed in HTML and JavaScript, unlike admin session tokens.

## Decision
Use **publishable keys** with format:

- `pk_test_{base62}` — test/sandbox environment
- `pk_live_{base62}` — production environment

Rules:

- Keys map to exactly one `tenantId` and environment.
- Raw key shown once at creation; only hash stored in DB (Phase 3B).
- Keys are revocable and rotatable from admin UI (Phase 3C).
- Keys carry default locale, theme profile reference, and domain allowlist metadata.
- **No secret `sk_` keys** on Storefront surface; admin remains Auth.js session.

Phase 3A SDK accepts key strings in client config for mock mode only; no persistence.

## Consequences
- Browser embed and React widget pass `publishableKey` in config.
- Server-side BFF may proxy with same key type (documented in SDK).
- Test/live data separation enforced at key resolution time in Phase 3B.
