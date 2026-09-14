# ADR-019: Storefront API Authentication

## Status
Accepted

## Context
Public booking endpoints must authenticate tenants without Auth.js cookies or admin RBAC, while blocking cross-tenant access and unauthorized domains.

## Decision
Storefront API authentication model:

| Mechanism | Usage |
|-----------|--------|
| `Authorization: Bearer pk_*` | Required on all Storefront routes |
| `Origin` / `Referer` | Validated against key domain allowlist (browser) |
| `X-HCP-Locale` | Optional locale override |
| `X-HCP-Session-Id` | Optional anonymous session for hold attribution |
| `Idempotency-Key` | Required on POST `/bookings`; recommended on POST `/holds` |

Explicitly **excluded**: cookies, JWT user sessions, API secret keys in browser.

Application layer uses `StorefrontContext` (Phase 3B) instead of `ActorContext`. Phase 3A SDK types document headers in `StorefrontClientConfig`.

## Consequences
- Middleware resolves key → tenant + allowlist before use cases run.
- 401 for invalid key; 403 for domain mismatch.
- Widget packages never import admin auth modules.
