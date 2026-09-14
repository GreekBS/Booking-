# ADR-020: Reservation Orchestrator and Stay Change Architecture

## Status

Accepted

## Context

Phase 2 (P2) introduces operator stay editing: change arrival, departure, unit, and guest count on an existing booking. The PMS must support this without duplicating commerce logic, without turning `Booking` into a god object, and without blocking future channel manager integrations (Booking.com, Airbnb, Vrbo, etc.).

Prior design discussions considered a parallel “amendment pipeline” with new holds and separate use cases. That was rejected in favour of **one reservation lifecycle** coordinated by a thin orchestrator and small engines.

## Decision

### 1. ReservationOrchestrator

Introduce `ReservationOrchestrator` in `packages/domain/src/commerce/reservation/` as a **stateless coordination façade**. It loads data via ports, delegates to engines and domain services, and invokes aggregate methods. It **does not** encode business rules.

Use cases (`ChangeBookingStayUseCase`, refactored create flows) call the orchestrator. Persistence and audit remain in the application layer.

### 2. Stay change does not create a new Hold

A `Hold` is a **temporary lock before a booking exists**. Once a booking exists, inventory is enforced by the booking’s calendar block (`unit_calendar_blocks`, `blockType: booking`, `sourceId: bookingId`).

Stay change flow:

```
Booking → ReservationOrchestrator → AvailabilityEvaluator → PricingCalculator
       → QuoteFactory.createForStayChange → Booking.applyStayChange → persist
```

No new `Hold` row, no hold calendar block, no hold TTL on amend quotes.

### 3. QuoteFactory

`QuoteFactory` centralises quote creation:

- `createFromHold` — pre-booking checkout (existing `Quote.create` path)
- `createForStayChange` — repricing an existing booking without a Hold

ADR-012 remains: quotes are immutable; stay changes create a **new Quote row** and update the booking’s `quoteId` / `quoteSnapshotId` pointer. Amend quotes reuse `booking.holdId` for creation lineage only.

### 4. Engines

Logic is split to prevent a god service:

| Engine | Role |
|--------|------|
| `StayAvailabilityEngine` | Load rules/blocks; run `AvailabilityEvaluator` (with `excludeSourceIds` for self-overlap on amend) |
| `StayPricingEngine` | Load rate plan; run `PricingCalculator` |
| `StayMutationEngine` | Compose preview/commit steps: availability → pricing → quote → `Booking.applyStayChange` |
| `QuoteFactory` | Build `Quote` entities (not an “engine” but same layer) |

Pure rules stay in `AvailabilityEvaluator` and `PricingCalculator`. Lifecycle rules stay on `Booking`.

### 5. Booking aggregate stays small

`Booking` owns: lifecycle state, stay assignment, guest contact snapshot, quote pointers, domain events. It does **not** own pricing, availability I/O, payments, folio, channels, or messaging.

Stay mutation is a single method: `applyStayChange(command, quote)` with granular events emitted by field diff.

### 6. Channels as a future bounded context

Channel contracts live in `packages/domain/src/channels/` (not under commerce). P2 adds types and ports only. Implementations (HTTP, OAuth, webhooks, jobs) arrive in Phase 5+.

Dependency direction: **Channels → Commerce** (via `NormalizedReservationCommand`). Commerce never imports OTA types.

### 7. ReservationConflictResolver (future extension point)

Placeholder at `commerce/reservation/conflicts/`:

- `ConflictTypes`
- `IReservationConflictResolver`

No P2 implementation or wiring. Reserved for P5 deterministic conflict handling (duplicate OTA imports, source priority, concurrent modifications) **above** pure geometry checks.

### 8. Future OTA integrations

Inbound: OTA adapter (Channels BC) → anti-corruption → `NormalizedReservationCommand` → `ReservationOrchestrator.importReservation` (P5) — same path as manual create.

Outbound: domain events / outbox → Channels exporters — orchestrator does not call OTA APIs.

`Booking` remains source-agnostic; channel IDs live in Channels BC aggregates (P5).

### 9. Double-booking prevention

| Layer | Mechanism |
|-------|-----------|
| Preview | `AvailabilityEvaluator` with `excludeSourceIds: [bookingId]` |
| Commit | Re-validate availability in transaction |
| Inventory | Update booking calendar block geometry atomically with booking |
| Database | PostgreSQL EXCLUDE on `unit_calendar_blocks` (ADR-010) |
| Future | `IReservationConflictResolver` for OTA/policy conflicts (P5) |

### 10. P2 out of scope

- Payment, folio, invoice logic
- Channel implementation (Booking.com, Airbnb, Vrbo, HTTP, OAuth, webhooks, sync jobs)
- `IReservationConflictResolver` implementation
- CRM, messaging, housekeeping
- Database migrations (unless explicitly required)
- Storefront/public stay-change API
- Generic `PATCH /bookings/:id`

## Consequences

- One commerce kernel for create and change; no parallel amendment pipeline
- Orchestrator and engines must stay thin; new features add engines or bounded contexts, not rules in the orchestrator
- Reservation Workspace (booking workspace UI) becomes the long-term reservation detail shell
- Channels and conflict resolver stubs establish boundaries early without P2 implementation cost

## References

- ADR-010: Double-booking prevention
- ADR-011: Hold TTL expiration
- ADR-012: Immutable quote snapshots
- P2 implementation phases A0–A4
