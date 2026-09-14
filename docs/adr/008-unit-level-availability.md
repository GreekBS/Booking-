# ADR-008: Unit-Level Availability

## Status
Accepted

## Context
Phase 2 must answer “can this stay be sold?” at the correct inventory granularity. Properties may contain multiple independently bookable units (hotel rooms) or a single default unit (villa).

## Decision
Availability, inventory blocks, holds, and bookings attach to **Unit**, not Property.

- Property supplies timezone, default policies, and catalog metadata only.
- All commerce aggregates (`Hold`, `Quote`, `Booking`) reference `unitId` and `propertyId`.
- `AvailabilityEvaluator` evaluates `(unitId, stayPeriod, guestCount)` against unit rules and unit-scoped calendar blocks.
- `ICatalogQueryPort` provides read-only Unit/Property data; catalog aggregates are not duplicated in commerce.

## Consequences
- Double-booking prevention is enforced per unit at persistence layer (ADR-010).
- Calendar APIs aggregate at unit level.
- Property-level “sell entire property” is modeled as a single default unit (ADR-003).
