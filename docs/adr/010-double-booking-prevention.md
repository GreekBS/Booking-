# ADR-010: Double-Booking Prevention Strategy

## Status
Accepted

## Context
Concurrent hold and booking requests must never produce overlapping confirmed stays on the same unit. Application-level checks alone are insufficient under race conditions.

## Decision
Use PostgreSQL **EXCLUDE** constraint on `(unit_id, stay_period)` where:

- `stay_period` is a `daterange` of property-local stay nights
- Constraint applies to rows with `status = 'active'` and `block_type IN ('hold', 'booking')`
- Hold and booking creation occur in a single transaction: aggregate row + calendar block + outbox event

Domain layer (`Hold`, `Booking`) enforces business invariants; infrastructure guarantees mutual exclusion at commit time.

## Consequences
- Hold creation fails fast with conflict when dates overlap (integration tests in Phase 2D).
- Expired/released holds remove or deactivate exclusion rows via expiry worker.
- Domain tests prove evaluator logic; concurrency proof requires real PostgreSQL (Phase 2D).
