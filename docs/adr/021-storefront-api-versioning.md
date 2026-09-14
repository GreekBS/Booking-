# ADR-021: Storefront API Versioning and Compatibility

## Status
Accepted

## Context
Storefront API and client SDKs serve external integrators who cannot redeploy on every HCP release. Breaking changes must be predictable.

## Decision

- URL path versioning: `/api/storefront/v1`.
- Breaking changes require `/v2` with minimum **12-month** deprecation window for v1.
- Non-breaking: additive JSON fields, new optional endpoints, new enum values documented as forward-compatible.
- SDK packages use **semver** aligned with API major version (`@hcp/storefront-sdk@1.x` → API v1).
- CDN embed path includes major version: `/embed/v1/hcp.js` (Phase 3C).
- `GET /config` returns `apiVersion: "1"` and `features` map for runtime capability detection.

Phase 3A SDK exports `STOREFRONT_API_VERSION = "1"` constant and types scoped to v1.

## Consequences
- OpenAPI spec published per major version (Phase 3A contract types serve as v1 source).
- Widget loader queries `/config/widget` for compatible chunk URL in Phase 3C.
- Deprecation communicated via `Sunset` response header when v1 approaches end-of-life.
