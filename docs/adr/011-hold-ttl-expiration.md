# ADR-011: Hold TTL and Expiration

## Status
Accepted

## Context
Checkout holds must be short-lived exclusive locks so inventory is not permanently blocked by abandoned sessions.

## Decision
- Default hold TTL: **15 minutes** (`DEFAULT_HOLD_TTL_SECONDS = 900`)
- `Hold` aggregate stores `expiresAt` as UTC timestamp
- Hold statuses: `active | released | expired | converted`
- Transitions:
  - `active → released` — explicit release
  - `active → expired` — expiry worker or domain `expire()` when `now >= expiresAt`
  - `active → converted` — booking created from hold
- `HoldExpired` domain event emitted on expiry (outbox in Phase 2C worker)
- Tenant-configurable TTL deferred to Phase 2C+ settings

## Consequences
- Quote validity tied to hold `expiresAt`
- Expiry job (Phase 2C) polls active holds past `expiresAt` and transitions + releases calendar block
- Domain rejects quote/booking operations on expired holds
