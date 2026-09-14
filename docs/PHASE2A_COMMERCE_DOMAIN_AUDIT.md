# Phase 2A — Commerce Domain Audit

**Date:** 2025-06-26  
**Scope:** Pure TypeScript commerce bounded context in `@hcp/domain`  
**Design reference:** `docs/phase-2-commerce-core-design.md`  
**ADRs:** 008–016

---

## 1. Files implemented

### Domain source (`packages/domain/src/commerce/`)

| Path | Role |
|------|------|
| `index.ts` | Barrel export |
| `shared/types/CommerceTypes.ts` | Shared commerce types and constants |
| `shared/value-objects/LocalDate.ts` | Property-local date VO |
| `shared/value-objects/Money.ts` | Decimal money VO (bigint scaled) |
| `shared/value-objects/StayPeriod.ts` | Checkout-exclusive stay range |
| `shared/value-objects/GuestCount.ts` | Positive guest count VO |
| `availability/AvailabilityEvaluator.ts` | Availability domain service |
| `pricing/PricingCalculator.ts` | Pricing domain service |
| `booking/domain/Hold.ts` | Hold aggregate |
| `booking/domain/Quote.ts` | Quote aggregate |
| `booking/domain/QuoteSnapshot.ts` | Immutable quote snapshot VO |
| `booking/domain/Booking.ts` | Booking aggregate |
| `booking/domain/BookingStateMachine.ts` | Hold and booking transition rules |
| `booking/domain/events/CommerceEvents.ts` | Domain events |
| `ports/CommercePorts.ts` | Repository and gateway port interfaces |

### ADRs (`docs/adr/`)

| ADR | File |
|-----|------|
| 008 | `008-unit-level-availability.md` |
| 009 | `009-unit-calendar-block-model.md` |
| 010 | `010-double-booking-prevention.md` |
| 011 | `011-hold-ttl-expiration.md` |
| 012 | `012-immutable-quote-snapshots.md` |
| 013 | `013-money-decimal-rules.md` |
| 014 | `014-dates-timezones-stay-periods.md` |
| 015 | `015-provider-agnostic-payments.md` |
| 016 | `016-confirmation-mode.md` |

### Tests (`packages/domain/tests/commerce/`)

| File | Focus |
|------|-------|
| `Money.test.ts` | Arithmetic, rounding, invalid currency |
| `StayPeriod.test.ts` | Checkout-exclusive, overlap edge cases |
| `AvailabilityEvaluator.test.ts` | All availability rules |
| `PricingCalculator.test.ts` | Seasons, DOW, LOS |
| `BookingFlow.test.ts` | Hold lifecycle, booking modes |
| `BookingStateMachine.test.ts` | Invalid transitions |
| `QuoteImmutability.test.ts` | Snapshot immutability |
| `CommerceFixtures.test.ts` | Scenario fixtures |
| `CommerceArchitecture.test.ts` | Import boundary scan |
| `fixtures/commerceFixtures.ts` | Shared test data and builders |

---

## 2. Domain objects

### Value objects
- `LocalDate`, `Money`, `StayPeriod`, `GuestCount`, `QuoteSnapshot`

### Aggregates
- `Hold` — TTL, release, expire, convert; emits `HoldCreated`, `HoldReleased`, `HoldExpired`
- `Quote` — append-only; immutable snapshot; emits `QuoteCreated`
- `Booking` — confirm, cancel, complete; emits `BookingCreated`, `BookingConfirmed`, `BookingCancelled`

### Domain services
- `AvailabilityEvaluator` — rules + blocks + turnover
- `PricingCalculator` — base rate, seasons, DOW modifiers, LOS discounts

### State machines
- `HoldStateMachine` — `active → released | expired | converted`
- `BookingStateMachine` — mode-aware confirmation; terminal states

---

## 3. Ports (interfaces only)

Defined in `ports/CommercePorts.ts`:

- `ICatalogQueryPort`
- `IHoldRepository`, `IQuoteRepository`, `IBookingRepository`
- `ICalendarBlockRepository`
- `IRatePlanRepository`, `IAvailabilityRulesRepository`
- `IPaymentGateway`
- `ITimezoneService`

`IUnitOfWork` reuses Phase 1 `InfrastructurePorts` (not duplicated).

---

## 4. Domain events

| Event | Aggregate |
|-------|-----------|
| `HoldCreated` | Hold |
| `HoldReleased` | Hold |
| `HoldExpired` | Hold |
| `QuoteCreated` | Quote |
| `BookingCreated` | Booking |
| `BookingConfirmed` | Booking |
| `BookingCancelled` | Booking |

---

## 5. Design alignment

| Design requirement | Phase 2A status |
|--------------------|-----------------|
| Money VO, no float | ✅ Implemented + tested |
| StayPeriod checkout-exclusive | ✅ Implemented + tested |
| AvailabilityEvaluator | ✅ Implemented + tested |
| PricingCalculator | ✅ Implemented + tested |
| Hold aggregate + TTL | ✅ Implemented + tested |
| Quote + immutable snapshot | ✅ Implemented + tested |
| Booking + state machine | ✅ Implemented + tested |
| Confirmation modes | ✅ Implemented + tested |
| Domain events | ✅ Implemented |
| Ports (no implementations) | ✅ Interfaces only |
| UnitAvailabilityRules entity | ⚠️ Types only (`UnitAvailabilityRulesProps`) |
| RatePlan aggregate | ⚠️ Types only (`RatePlanProps`) |
| UnitCalendarBlock entity | ❌ Deferred to Phase 2B |
| PaymentIntent entity | ❌ Deferred (optional stub) |
| StayPeriodValidator (standalone) | ✅ Merged into `StayPeriod.create` |
| Commerce use cases | ❌ Phase 2C |
| Inventory aggregate | ❌ Phase 2B/2C |

---

## 6. Architecture violations

**Scan result: none in commerce domain source.**

Verified via `CommerceArchitecture.test.ts` and manual grep:

- No `@prisma/client`, `@hcp/database`, `next/*`, `react`, `node:*`, `crypto`, or `fs` imports in `src/commerce/**`
- Commerce depends only on `shared/kernel`, `shared/errors`, and internal commerce modules
- `Date` used for UTC timestamps (allowed per ADR-014)
- Port interfaces define infrastructure contracts without importing implementations

---

## 7. Missing pieces (expected — not Phase 2A scope)

- Prisma schema and migrations for commerce tables
- Repository implementations
- RLS policies and EXCLUDE constraint
- Application use cases (CreateHold, CreateQuote, ConfirmBooking, etc.)
- Admin/calendar API routes
- Hold expiry background job
- `ITimezoneService` implementation
- `IPaymentGateway` stub adapter
- Integration and concurrency tests
- `UnitAvailabilityRules` and `RatePlan` as full aggregates (optional; props sufficient for evaluators today)

---

## 8. Readiness for Phase 2B

| Criterion | Ready |
|-----------|-------|
| Pure domain with no infrastructure imports | ✅ |
| ADRs 008–016 documented | ✅ |
| Aggregates emit domain events | ✅ |
| Port interfaces defined | ✅ |
| Comprehensive domain unit tests | ✅ |
| Test fixtures for key scenarios | ✅ |
| Design gaps documented | ✅ |

**Verdict: Phase 2A is complete.** Phase 2B may proceed when authorized — domain contracts, events, and ports are stable.
