# Phase 2: Commerce Core — Architecture & Design Document

**Status:** Design (no implementation)  
**Depends on:** Phase 1 Platform Kernel, Catalog (Property → Unit), RBAC, Multi-tenancy, RLS, Outbox  
**Phase 1 dependency note:** Phase 1 is **complete in code**; **Supabase / production DB verification is pending**. All Phase 1 capabilities below are assumed to exist but marked **pending production verification** where runtime proof is required.

---

## 1. Goals

Phase 2 introduces the **Commerce Core** bounded context: the minimum set of engines required to sell nights on a Unit without building storefront, widgets, CMS, channel manager, or live payment capture.

| Goal | Success measure |
|------|-----------------|
| **Sellable inventory** | Operators can define when a Unit is open/closed and block dates manually |
| **Accurate availability** | API returns correct open nights for a Unit in property timezone |
| **Safe checkout path** | Hold → Quote → Confirm flow with zero double bookings under concurrency |
| **Deterministic pricing** | Nightly price for a stay is reproducible from stored rules at quote time |
| **Immutable commercial terms** | Quote snapshot never mutates; booking references snapshot version |
| **Payment-ready architecture** | Booking can enter `payment_pending` with provider-agnostic ports; no Stripe hardcoding |
| **Calendar foundation** | Admin can view bookings, holds, and blocks on a Unit calendar |
| **Tenant isolation** | All commerce data scoped by `tenantId` + RLS (defense in depth) |
| **Event-driven integration** | Outbox events for holds, quotes, bookings (Phase 3+ consumers) |

---

## 2. Scope

### In scope (Phase 2)

1. **Inventory Engine** — Unit calendar blocks (manual, maintenance, owner); inventory source of truth per Unit-night
2. **Availability Engine** — Rule evaluation (min/max stay, check-in/out days, advance booking window, turnover buffer); answers “can this Unit be booked for these dates?”
3. **Booking Holds** — Short-lived exclusive locks on Unit date ranges with TTL and expiry job
4. **Pricing Engine** — Base rates, seasonal overrides, day-of-week modifiers; outputs priced nights as `Decimal`
5. **Quote Engine** — Builds immutable quote snapshots from pricing + policies; links to hold
6. **Booking Engine** — Lifecycle state machine; confirm from hold; cancel; transactional creation
7. **Payment preparation architecture** — Domain ports, persistence schema, status transitions; **no live provider integration**
8. **Calendar foundation** — Read APIs aggregating blocks, holds, bookings for admin UI
9. **RBAC extensions** — Commerce permissions for admin/manager (property-scoped where applicable)
10. **Domain events + outbox** — `HoldCreated`, `HoldExpired`, `QuoteCreated`, `BookingCreated`, `BookingConfirmed`, `BookingCancelled`
11. **Admin API** (internal) — `/api/admin/v1/...` only; no public Storefront API

### Assumed from Phase 1 (pending production verification)

- Tenant, User, Membership, RBAC (`admin` / `manager` / `super_admin`)
- Property catalog with `timezone`, policies (check-in/out, cancellation type)
- Unit as bookable entity under Property (`maxGuests`, `status`)
- `tenantId` on tenant-owned rows, app-layer scoping + PostgreSQL RLS
- Transactional outbox pattern (`IOutboxRepository`)
- Clean Architecture: domain pure TS, use cases, thin route handlers
- `IIdGenerator`, no Node/crypto in domain

---

## 3. Explicitly out of scope

| Excluded | Phase |
|----------|-------|
| Stripe / Viva / PayPal live integration | Phase 2.5+ |
| Storefront / public booking API | Phase 3 |
| Embeddable booking widget | Phase 3 |
| CMS / PropertyContent | Phase 4 |
| AI pricing / dynamic yield | Phase 6+ |
| Channel manager / OTA sync | Phase 5+ |
| Guest CRM / messaging | Phase 3+ |
| Invoicing / accounting export | Phase 3+ |
| Multi-unit “cart” (book multiple units one checkout) | Phase 3 |
| Refunds / chargebacks automation | Phase 2.5+ |
| Email confirmations (stub OK like Phase 1 invites) | Optional stub only |
| Revenue reporting dashboards | Phase 3 |

---

## 4. Functional requirements

### FR-INV: Inventory

| ID | Requirement |
|----|-------------|
| FR-INV-01 | Operator can create **manual blocks** on a Unit for a date range (owner stay, maintenance) |
| FR-INV-02 | Operator can remove/update manual blocks (not system-generated booking/hold blocks) |
| FR-INV-03 | Inventory is tracked at **Unit** granularity (one row per Unit-night or one exclusion range per block) |
| FR-INV-04 | Archived/inactive Units reject new blocks and bookings |
| FR-INV-05 | Blocks inherit property **timezone** for date boundary interpretation |

### FR-AVL: Availability

| ID | Requirement |
|----|-------------|
| FR-AVL-01 | System evaluates availability for `(unitId, checkIn, checkOut, guestCount)` |
| FR-AVL-02 | Rules: min nights, max nights, allowed check-in weekdays, allowed check-out weekdays, advance booking min/max days |
| FR-AVL-03 | Turnover buffer: optional N nights blocked after each checkout before next check-in |
| FR-AVL-04 | `guestCount` must not exceed Unit `maxGuests` |
| FR-AVL-05 | Availability query returns per-night breakdown or structured unavailability reason |
| FR-AVL-06 | Property-level default rules with Unit-level overrides (Unit wins) |

### FR-HOLD: Booking holds

| ID | Requirement |
|----|-------------|
| FR-HOLD-01 | Create hold on available date range; default TTL **15 minutes** (tenant-configurable later) |
| FR-HOLD-02 | Hold exclusively prevents other holds/bookings on overlapping Unit-nights |
| FR-HOLD-03 | Hold can be released explicitly or expires automatically |
| FR-HOLD-04 | One active hold per session/customer reference optional; at minimum one hold per `(unitId, range)` |
| FR-HOLD-05 | Expired holds emit `HoldExpired` outbox event |

### FR-PRC: Pricing

| ID | Requirement |
|----|-------------|
| FR-PRC-01 | Base nightly rate per Unit (default currency from tenant) |
| FR-PRC-02 | Seasonal rate overrides (date-bounded) |
| FR-PRC-03 | Day-of-week modifiers (e.g. Fri/Sat +20%) |
| FR-PRC-04 | LOS discount tiers (optional Phase 2 stretch: 7+ nights −10%) |
| FR-PRC-05 | All amounts stored and computed as **Decimal** (Prisma `Decimal`, domain string or dedicated `Money` VO) |
| FR-PRC-06 | Pricing evaluation is deterministic for `(unitId, checkIn, checkOut, quotedAt)` |

### FR-QTE: Quotes

| ID | Requirement |
|----|-------------|
| FR-QTE-01 | Quote built from active hold + pricing engine output |
| FR-QTE-02 | Quote snapshot is **immutable** once created (new quote = new row) |
| FR-QTE-03 | Snapshot includes: nightly line items, subtotal, fees placeholder, taxes placeholder, total, currency, property timezone, check-in/out dates |
| FR-QTE-04 | Quote references `holdId` and expires with hold (or shorter) |
| FR-QTE-05 | Emits `QuoteCreated` outbox event |

### FR-BKG: Bookings

| ID | Requirement |
|----|-------------|
| FR-BKG-01 | Confirm booking from valid hold + quote in **single transaction** |
| FR-BKG-02 | Booking states: see §14 state machine |
| FR-BKG-03 | Operator can cancel booking (policy-aware flags stored; enforcement Phase 2.5) |
| FR-BKG-04 | Booking stores guest contact fields (name, email, phone), `guestCount`, `unitId`, `propertyId`, `tenantId` |
| FR-BKG-05 | Booking references immutable `quoteSnapshotId` |
| FR-BKG-06 | Emits `BookingCreated`, `BookingConfirmed`, `BookingCancelled` |
| FR-BKG-07 | No double booking: overlapping confirmed bookings impossible |

### FR-PAY: Payment preparation

| ID | Requirement |
|----|-------------|
| FR-PAY-01 | Booking may enter `payment_pending` before `confirmed` (configurable tenant default: manual confirm vs payment-required) |
| FR-PAY-02 | `IPaymentGateway` port: createIntent, capture, cancelIntent — **stub implementation only** |
| FR-PAY-03 | Persist `payment_records` with provider-agnostic metadata JSON |
| FR-PAY-04 | Domain never imports Stripe types |

### FR-CAL: Calendar

| ID | Requirement |
|----|-------------|
| FR-CAL-01 | GET calendar for Unit: merges blocks, active holds, confirmed bookings |
| FR-CAL-02 | Calendar dates displayed in **property timezone** |
| FR-CAL-03 | Manager sees calendar only for assigned properties |

---

## 5. Non-functional requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Correctness | Zero double bookings under concurrent hold/booking requests (proven by integration tests) |
| NFR-02 | Consistency | Booking + inventory block + outbox in one DB transaction |
| NFR-03 | Isolation | 100% tenant-owned tables include `tenantId`; RLS enabled |
| NFR-04 | Performance | Availability query p95 < 200ms for single Unit, 365-day horizon |
| NFR-05 | Performance | Hold creation p95 < 300ms including exclusion constraint check |
| NFR-06 | Money | No IEEE float for money; use `Decimal(19,4)` minimum |
| NFR-07 | Time | Store UTC timestamps; interpret stay dates in property `timezone` (IANA) |
| NFR-08 | Architecture | Domain layer: pure TypeScript, no Prisma/Next.js |
| NFR-09 | Architecture | All mutations via application use cases |
| NFR-10 | Security | RBAC on all admin commerce endpoints |
| NFR-11 | Audit | State transitions append audit log entries (use-case layer) |
| NFR-12 | Observability | Structured logs: `requestId`, `tenantId`, `userId`, `bookingId`, `unitId` |
| NFR-13 | Testability | Concurrency tests require real PostgreSQL (Supabase) |

---

## 6. ADRs required for Phase 2

| ADR | Title | Decision summary |
|-----|-------|------------------|
| **ADR-008** | Unit-level availability | Availability, inventory blocks, holds, and bookings attach to **Unit**, not Property. Property supplies timezone + default rules only. |
| **ADR-009** | Calendar block model | Single `unit_calendar_blocks` table with typed blocks (`manual`, `hold`, `booking`, `turnover`) rather than separate overlap tables. |
| **ADR-010** | Double-booking prevention | PostgreSQL `EXCLUDE` constraint on `(unit_id, stay_period)` using `daterange` for stay nights in property-local dates, status-filtered. |
| **ADR-011** | Booking hold TTL | Holds expire after 15 min default; cron/worker transitions to `expired` and deletes/releases exclusion row. |
| **ADR-012** | Immutable quote snapshots | Quotes are append-only; bookings reference snapshot ID; repricing = new quote. |
| **ADR-013** | Money representation | `Money` value object wraps decimal string; DB `NUMERIC(19,4)`; no float. |
| **ADR-014** | Stay date timezone | Stay dates are **property-local dates** (`DATE`); timestamps for events in UTC. Conversion via explicit `TimezoneService` port. |
| **ADR-015** | Payment gateway port | Provider-agnostic `IPaymentGateway`; Stripe adapter in infrastructure Phase 2.5. |
| **ADR-016** | Booking confirmation modes | Tenant setting: `manual` (hold→confirm by operator) vs `payment_required` (hold→quote→payment_pending→confirmed). |

---

## 7. Domain model

### Bounded context: `commerce`

Separate from `catalog` (Phase 1). Catalog publishes Unit/Property read models via repository ports — **no aggregate duplication**.

```
┌─────────────────────────────────────────────────────────────────┐
│                        COMMERCE CONTEXT                         │
├─────────────────────────────────────────────────────────────────┤
│  Inventory          AvailabilityRules (VO/entity per Unit)    │
│  UnitCalendarBlock  AvailabilityService (domain service)      │
│                                                                 │
│  RatePlan / NightlyRate / SeasonalOverride                      │
│  PricingService (domain service)                                │
│                                                                 │
│  Hold (aggregate)                                               │
│  Quote (aggregate) + QuoteLineItem (VO)                         │
│  Booking (aggregate)                                            │
│  PaymentIntent (entity, optional Phase 2 stub)                  │
└─────────────────────────────────────────────────────────────────┘
         │ uses (read-only ports)
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  CATALOG (Phase 1) — Unit, Property, PropertyPolicies, timezone│
└─────────────────────────────────────────────────────────────────┘
```

### Aggregates

#### `Hold` (aggregate root)
- Identity: `holdId`
- Invariants: linked to single `unitId`; `checkIn`/`checkOut` property-local dates; `expiresAt` UTC; status `active|released|expired|converted`
- Emits: `HoldCreated`, `HoldExpired`, `HoldReleased`

#### `Quote` (aggregate root)
- Identity: `quoteId`
- Immutable after creation
- Contains: `QuoteSnapshot` (VO), `holdId`, `unitId`, `currency`, line items
- Emits: `QuoteCreated`

#### `Booking` (aggregate root)
- Identity: `bookingId`
- References: `quoteSnapshotId`, `unitId`, `propertyId`, `holdId?`
- Guest details VO
- Emits: `BookingCreated`, `BookingConfirmed`, `BookingCancelled`

#### `UnitAvailabilityRules` (entity / aggregate — per Unit)
- Min/max nights, check-in/out weekday masks, advance booking window, turnover nights
- Optional: property defaults copied on Unit create, then independent

#### `RatePlan` (aggregate root — per Unit)
- Base nightly rate, currency, seasonal overrides collection, DOW modifiers

#### `UnitCalendarBlock` (entity — part of Inventory aggregate OR standalone)
- **Design choice:** Treat manual blocks as `InventoryBlock` aggregate; system blocks (hold/booking) created by respective aggregates via domain service coordinating persistence.

**Recommendation:** `InventoryApplicationService` coordinates block rows; manual blocks are operator-owned aggregate; hold/booking aggregates request block creation through `ICalendarBlockRepository` in same transaction.

### Value objects

- `StayPeriod` — `{ checkIn: LocalDate, checkOut: LocalDate }` (checkout exclusive)
- `Money` — `{ amount: string, currency: ISO4217 }` — no float
- `QuoteSnapshot` — frozen line items + totals
- `GuestCount` — positive int, max enforced against Unit
- `LocalDate` — string `YYYY-MM-DD` in property timezone context

### Domain services

- `AvailabilityEvaluator` — pure function over rules + blocks + existing bookings/holds
- `PricingCalculator` — pure function over rate plan + stay period
- `StayPeriodValidator` — checkout > checkIn, max length caps

### Ports (domain)

- `ICatalogQueryPort` — `getUnit`, `getProperty`, `getPropertyTimezone` (read-only, anti-corruption)
- `ICalendarBlockRepository`
- `IHoldRepository`, `IQuoteRepository`, `IBookingRepository`
- `IRatePlanRepository`, `IAvailabilityRulesRepository`
- `IPaymentGateway` (infrastructure in Phase 2.5)
- `ITimezoneService` — local date ↔ UTC boundary
- `IUnitOfWork`

---

## 8. Database design

All tenant-owned tables: `tenant_id UUID NOT NULL`, FK to `tenants`, index `(tenant_id, ...)`, RLS policy matching Phase 1 pattern.

### New tables (summary)

```sql
-- Availability rules (1:1 with unit)
unit_availability_rules (
  id, tenant_id, unit_id UNIQUE,
  min_nights, max_nights,
  check_in_days SMALLINT[],  -- 0=Sun..6=Sat allowed
  check_out_days SMALLINT[],
  advance_min_days INT, advance_max_days INT,
  turnover_nights INT DEFAULT 0,
  created_at, updated_at
)

-- Rate plans
rate_plans (
  id, tenant_id, unit_id UNIQUE,
  base_nightly_amount NUMERIC(19,4),
  currency CHAR(3),
  created_at, updated_at
)

rate_seasons (
  id, tenant_id, rate_plan_id,
  name, start_date DATE, end_date DATE,
  nightly_amount NUMERIC(19,4),
  CONSTRAINT valid_range CHECK (start_date < end_date)
)

rate_dow_modifiers (
  id, tenant_id, rate_plan_id,
  day_of_week SMALLINT, -- 0-6
  modifier_type ENUM('fixed','percent'),
  modifier_value NUMERIC(19,4)
)

-- Calendar blocks (inventory + holds + bookings)
unit_calendar_blocks (
  id, tenant_id, unit_id, property_id,
  block_type ENUM('manual','hold','booking','turnover'),
  source_id UUID,  -- hold_id or booking_id or null for manual
  stay_period DATERANGE NOT NULL,  -- property-local dates [checkIn, checkOut)
  status ENUM('active','released','expired','cancelled'),
  reason TEXT,
  created_at, updated_at,
  expires_at TIMESTAMPTZ  -- for holds
)

-- EXCLUDE constraint (critical):
-- EXCLUDE USING gist (unit_id WITH =, stay_period WITH &&)
-- WHERE (status = 'active' AND block_type IN ('hold','booking'))

-- Holds
booking_holds (
  id, tenant_id, unit_id, property_id,
  check_in DATE, check_out DATE,
  guest_count INT,
  status ENUM('active','released','expired','converted'),
  expires_at TIMESTAMPTZ,
  idempotency_key VARCHAR(64),
  created_at, updated_at
)

-- Quotes (immutable)
quotes (
  id, tenant_id, hold_id, unit_id, property_id,
  snapshot JSONB NOT NULL,  -- full QuoteSnapshot
  currency CHAR(3),
  total_amount NUMERIC(19,4),
  expires_at TIMESTAMPTZ,
  created_at  -- no updated_at (immutable)
)

-- Bookings
bookings (
  id, tenant_id, unit_id, property_id,
  quote_id UUID NOT NULL,
  hold_id UUID,
  guest_name, guest_email, guest_phone,
  guest_count INT,
  check_in DATE, check_out DATE,
  status ENUM('pending','payment_pending','confirmed','cancelled','completed'),
  total_amount NUMERIC(19,4),
  currency CHAR(3),
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at, updated_at
)

-- Payment preparation (no provider SDK)
payment_records (
  id, tenant_id, booking_id,
  amount NUMERIC(19,4),
  currency CHAR(3),
  status ENUM('pending','authorized','captured','failed','cancelled'),
  provider VARCHAR(32),  -- 'stub' | 'stripe' | 'viva'
  provider_reference VARCHAR(255),
  metadata JSONB,
  created_at, updated_at
)

-- Tenant commerce settings
tenant_commerce_settings (
  tenant_id PK,
  default_hold_ttl_seconds INT DEFAULT 900,
  confirmation_mode ENUM('manual','payment_required') DEFAULT 'manual',
  default_currency CHAR(3)
)
```

### Index strategy

- `unit_calendar_blocks (tenant_id, unit_id, block_type, status)`
- `bookings (tenant_id, unit_id, check_in, check_out)`
- `bookings (tenant_id, status, created_at DESC)`
- GIST index on `stay_period` for overlap queries

### Migration dependency

Requires Phase 1 `units`, `properties`, `tenants` tables (**pending production verification** on Supabase).

---

## 9. Inventory model

### Concepts

| Concept | Description |
|---------|-------------|
| **Unit-night** | Atomic sellable cell: property-local date D where guest occupies Unit overnight |
| **Stay period** | `[checkIn, checkOut)` — checkout morning not sold |
| **Manual block** | Operator-created; reduces sellable inventory |
| **System block** | Created by Hold or Booking aggregate; tied to `source_id` |
| **Turnover block** | Auto-generated buffer nights after checkout (optional rule) |

### Operations

1. **Block** — insert `unit_calendar_blocks` type=`manual`, status=`active`
2. **Unblock** — status=`released` (soft delete pattern; keep audit trail)
3. **Query inventory** — nights in range minus active blocks

### Challenge

**Whole-property vs multi-unit:** A Property with 3 Units has independent inventories. Booking “entire property” in Phase 3 may require bundling; Phase 2 treats each Unit separately. Document as known limitation.

---

## 10. Availability rules

### Evaluation order (deterministic)

1. Unit `status === active` and not archived
2. Property not archived/suspended
3. `guestCount <= unit.maxGuests`
4. Stay length within min/max nights
5. `checkIn` weekday allowed
6. `checkOut` weekday allowed (if configured)
7. Advance booking window (today in property TZ + min/max days)
8. No overlap with active `manual`, `hold`, or `booking` blocks
9. Turnover: if previous booking checkout on D, next checkIn must be >= D + turnoverNights

### Rule inheritance

```
PropertyDefaults (optional template on property create)
        │
        ▼ copied once
UnitAvailabilityRules (editable per unit)
```

Property does **not** dynamically override Unit at query time (avoids hidden coupling). Sync tool optional admin action “Apply property defaults to all units.”

### API output shape

```json
{
  "available": false,
  "reasons": [
    { "code": "MIN_NIGHTS", "message": "Minimum 3 nights required" },
    { "code": "OVERLAP", "message": "Dates conflict with existing hold" }
  ],
  "nightly": [ { "date": "2026-07-01", "available": true }, ... ]
}
```

---

## 11. Booking hold strategy

### Flow

```
Client                    API                     DB
  │ POST /holds             │                       │
  ├────────────────────────►│ Begin transaction     │
  │                         │ Check availability    │
  │                         │ INSERT hold           │
  │                         │ INSERT calendar_block │
  │                         │   type=hold, EXCLUDE  │
  │                         │ Commit + outbox       │
  ◄─────────────────────────┤ HoldCreated           │
```

### TTL

- Default **900 seconds** (15 min); stored `expires_at`
- **Expiry worker** (Phase 2): cron every 1 min OR pg_cron on Supabase
  - `SELECT ... WHERE expires_at < now() AND status = 'active' FOR UPDATE SKIP LOCKED`
  - Release block, set hold `expired`, emit `HoldExpired`

### Idempotency

- `Idempotency-Key` header on hold create; unique `(tenant_id, idempotency_key)` prevents duplicate holds on retry

### Hold → Quote → Booking

- Hold must be `active` and not expired
- Quote creation validates hold ownership (same tenant, same unit)
- Booking confirmation converts hold (`converted`), block type `hold` → `booking` or replace row

**Design challenge:** Mutating block type vs delete+insert. **Recommendation:** Delete hold block, insert booking block in same transaction to keep EXCLUDE constraint simple.

---

## 12. Pricing model

### Phase 2 pricing stack (minimal viable)

1. **Base rate** — `rate_plans.base_nightly_amount` per Unit
2. **Season** — override if night ∈ `[start_date, end_date]`
3. **DOW modifier** — apply percent or fixed adjustment last

### Calculation (per night)

```
nightPrice = seasonOverride ?? baseRate
if dowModifier: nightPrice = apply(nightPrice, modifier)
lineItem = { date, unitPrice: Money }
subtotal = sum(lineItems)
total = subtotal + fees + taxes  -- fees/taxes Phase 2: zero or manual flat fee placeholder
```

### LOS discounts

Stretch goal; if included, store `rate_los_discounts (min_nights, percent)` — apply once to subtotal.

### Currency

- Quote currency = rate plan currency = tenant default unless explicit multi-currency Phase 4
- No FX conversion in Phase 2

---

## 13. Quote snapshot model

### Immutability contract

- `quotes` row has **no `updated_at`**
- `snapshot JSONB` contains complete commercial breakdown at creation time
- Booking stores `quote_id` FK; repricing never mutates quote

### Snapshot schema (versioned)

```json
{
  "version": 1,
  "unitId": "uuid",
  "propertyId": "uuid",
  "timezone": "Europe/Athens",
  "checkIn": "2026-07-01",
  "checkOut": "2026-07-05",
  "guestCount": 2,
  "lineItems": [
    { "date": "2026-07-01", "description": "Nightly rate", "amount": "120.0000", "currency": "EUR" }
  ],
  "subtotal": "480.0000",
  "fees": [],
  "taxes": [],
  "total": "480.0000",
  "currency": "EUR",
  "pricedAt": "2026-06-26T10:00:00.000Z",
  "pricingRuleHash": "sha256..." 
}
```

`pricingRuleHash` optional — aids debugging when rates change after quote.

### Expiry

- `expires_at = min(hold.expires_at, hold.expires_at)` — quote dies with hold

---

## 14. Booking lifecycle / state machine

```
                    ┌──────────────┐
                    │   pending    │  (optional: direct operator booking)
                    └──────┬───────┘
                           │ submit payment / operator confirm
                           ▼
              ┌────────────────────────┐
              │    payment_pending     │  (if confirmation_mode = payment_required)
              └───────────┬────────────┘
                          │ payment authorized (Phase 2.5) OR manual override
                          ▼
                   ┌─────────────┐
         ┌────────►│  confirmed  │◄────────┐
         │         └──────┬──────┘         │
         │                │                 │
    hold+quote      checkout past      operator cancel
    confirm              date                │
         │                │                 │
         │                ▼                 ▼
         │         ┌─────────────┐   ┌─────────────┐
         └─────────│  completed  │   │  cancelled  │
                   └─────────────┘   └─────────────┘
```

### Transitions (Phase 2)

| From | To | Trigger |
|------|-----|---------|
| — | `confirmed` | `ConfirmBookingUseCase` (manual mode, from hold+quote) |
| — | `payment_pending` | `ConfirmBookingUseCase` when payment required |
| `payment_pending` | `confirmed` | `MarkBookingPaidUseCase` (stub gateway) |
| `confirmed` | `cancelled` | `CancelBookingUseCase` |
| `confirmed` | `completed` | `CompleteBookingUseCase` (batch job: checkOut date passed) |

Hold states parallel: `active → converted|expired|released`

---

## 15. Concurrency and double-booking prevention

### Primary mechanism: PostgreSQL EXCLUDE constraint

```sql
ALTER TABLE unit_calendar_blocks
  ADD CONSTRAINT unit_calendar_no_overlap
  EXCLUDE USING gist (
    unit_id WITH =,
    stay_period WITH &&
  )
  WHERE (status = 'active' AND block_type IN ('hold', 'booking'));
```

Requires `btree_gist` extension (available on Supabase).

### Transaction pattern

```text
BEGIN;
  -- 1. Validate availability (read committed may race; constraint is final arbiter)
  -- 2. INSERT hold/booking
  -- 3. INSERT calendar block
  -- 4. INSERT outbox events
COMMIT;
-- ON exclusion violation → map to ConflictError "Dates no longer available"
```

### Why not application-only locks

Application locks fail across serverless instances and crash mid-flight. **DB constraint is source of truth.**

### Challenge: hold expiry race

Scenario: Hold expires at T; user confirms at T−1s. **Mitigation:** Confirm re-checks `hold.status === active AND expires_at > now()` inside transaction before block conversion.

### Load testing target

- 50 concurrent hold attempts on same Unit/dates → exactly 1 success, 49 conflicts

---

## 16. RLS and tenant isolation rules

### Application layer

- All use cases receive `tenantId` from resolved tenant context (Phase 1)
- Repositories always filter `WHERE tenant_id = :tenantId`
- `setTenantContext(tenantId)` before queries (**pending production verification**)

### RLS policies (new tables)

Mirror Phase 1 pattern:

```sql
ALTER TABLE unit_calendar_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_unit_calendar_blocks ON unit_calendar_blocks
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
```

Apply to: `unit_availability_rules`, `rate_plans`, `rate_seasons`, `rate_dow_modifiers`, `unit_calendar_blocks`, `booking_holds`, `quotes`, `bookings`, `payment_records`, `tenant_commerce_settings`.

### Cross-tenant attack scenarios

| Attack | Defense |
|--------|---------|
| Guess UUID bookingId from other tenant | RLS + repository tenant filter |
| API call with wrong `x-tenant-id` | Membership check (Phase 1) + RLS |
| Hold on Unit from other tenant | FK + tenant_id match validation in use case |

### Manager property scope

- `booking:read:assigned` — filter bookings where `property_id IN membership.propertyIds`
- Admins: full tenant scope

---

## 17. API design

**Prefix:** `/api/admin/v1` only (no storefront). All routes require auth + tenant context.

### Inventory

| Method | Path | Use case |
|--------|------|----------|
| GET | `/units/:unitId/calendar` | `GetUnitCalendarUseCase` |
| POST | `/units/:unitId/blocks` | `CreateManualBlockUseCase` |
| DELETE | `/units/:unitId/blocks/:blockId` | `RemoveManualBlockUseCase` |

### Availability rules

| GET | `/units/:unitId/availability-rules` | `GetAvailabilityRulesUseCase` |
| PUT | `/units/:unitId/availability-rules` | `UpdateAvailabilityRulesUseCase` |

### Pricing

| GET | `/units/:unitId/rate-plan` | `GetRatePlanUseCase` |
| PUT | `/units/:unitId/rate-plan` | `UpdateRatePlanUseCase` |

### Availability query

| POST | `/units/:unitId/availability/check` | `CheckAvailabilityUseCase` |

Body: `{ checkIn, checkOut, guestCount }`

### Holds

| POST | `/holds` | `CreateHoldUseCase` |
| DELETE | `/holds/:holdId` | `ReleaseHoldUseCase` |

### Quotes

| POST | `/quotes` | `CreateQuoteUseCase` — body: `{ holdId }` |
| GET | `/quotes/:quoteId` | `GetQuoteUseCase` |

### Bookings

| POST | `/bookings` | `ConfirmBookingUseCase` — body: `{ quoteId, guest: {...} }` |
| GET | `/bookings` | `ListBookingsUseCase` |
| GET | `/bookings/:bookingId` | `GetBookingUseCase` |
| POST | `/bookings/:bookingId/cancel` | `CancelBookingUseCase` |

### Payment preparation (stub)

| POST | `/bookings/:bookingId/payment-intent` | `CreatePaymentIntentUseCase` |
| POST | `/bookings/:bookingId/payment/confirm` | `ConfirmPaymentUseCase` (stub) |

### Permissions (new)

```
availability:read:tenant | availability:read:assigned
availability:update:tenant
pricing:read:tenant | pricing:update:tenant
hold:create:tenant  (future public API reuses port)
quote:create:tenant
booking:read:tenant | booking:read:assigned
booking:create:tenant
booking:cancel:tenant
```

---

## 18. Domain events

| Event | Aggregate | Payload highlights |
|-------|-----------|-------------------|
| `HoldCreated` | Hold | unitId, stayPeriod, expiresAt |
| `HoldExpired` | Hold | holdId, unitId |
| `HoldReleased` | Hold | holdId |
| `QuoteCreated` | Quote | quoteId, holdId, total, currency |
| `BookingCreated` | Booking | bookingId, quoteId, unitId, status |
| `BookingConfirmed` | Booking | bookingId, checkIn, checkOut |
| `BookingCancelled` | Booking | bookingId, reason |

All persisted via Phase 1 outbox (**pending production verification**).

### Future consumers (not Phase 2)

- Email notifications
- Channel manager sync
- Analytics warehouse
- Revenue recognition

---

## 19. Folder structure additions

```
packages/domain/src/
  commerce/
    inventory/
      domain/UnitCalendarBlock.ts
      domain/ManualBlock.ts          # if separate aggregate
      application/BlockUseCases.ts
      ports/ICalendarBlockRepository.ts
    availability/
      domain/UnitAvailabilityRules.ts
      domain/AvailabilityEvaluator.ts
      application/AvailabilityUseCases.ts
      ports/IAvailabilityRulesRepository.ts
    pricing/
      domain/RatePlan.ts
      domain/Money.ts
      domain/PricingCalculator.ts
      application/PricingUseCases.ts
      ports/IRatePlanRepository.ts
    quoting/
      domain/Quote.ts
      domain/QuoteSnapshot.ts
      application/QuoteUseCases.ts
      ports/IQuoteRepository.ts
    booking/
      domain/Booking.ts
      domain/Hold.ts
      domain/BookingStatus.ts
      application/HoldUseCases.ts
      application/BookingUseCases.ts
      ports/IHoldRepository.ts
      ports/IBookingRepository.ts
    payment/
      ports/IPaymentGateway.ts
      application/PaymentUseCases.ts   # stub only
    shared/
      value-objects/StayPeriod.ts
      value-objects/LocalDate.ts
      ports/ICatalogQueryPort.ts
      ports/ITimezoneService.ts

packages/database/src/
  repositories/commerce/
    CalendarBlockRepository.ts
    HoldRepository.ts
    QuoteRepository.ts
    BookingRepository.ts
    RatePlanRepository.ts
    AvailabilityRulesRepository.ts
  jobs/
    ExpireHoldsJob.ts

packages/validators/src/
  commerce.ts                        # Zod schemas

packages/permissions/src/
  index.ts                           # extend PERMISSIONS

apps/web/app/api/admin/v1/
  units/[unitId]/calendar/route.ts
  units/[unitId]/blocks/route.ts
  units/[unitId]/availability-rules/route.ts
  units/[unitId]/rate-plan/route.ts
  units/[unitId]/availability/check/route.ts
  holds/route.ts
  holds/[holdId]/route.ts
  quotes/route.ts
  quotes/[quoteId]/route.ts
  bookings/route.ts
  bookings/[bookingId]/route.ts
  bookings/[bookingId]/cancel/route.ts
  bookings/[bookingId]/payment-intent/route.ts

docs/adr/
  008-unit-level-availability.md
  ... 016-confirmation-modes.md
```

---

## 20. Tests required

### Domain unit tests (no DB)

- `AvailabilityEvaluator` — all rule permutations, edge cases (checkout=checkIn+1 night)
- `PricingCalculator` — season overlap, DOW modifiers, decimal precision
- `StayPeriodValidator` — invalid ranges
- `QuoteSnapshot` immutability
- `Booking` state machine transitions (invalid transitions fail)
- `Money` — no float drift, rounding policy (bankers vs half-up — pick half-up, document)

### Integration tests (PostgreSQL / Supabase required)

- EXCLUDE constraint: concurrent hold inserts
- Hold expiry job releases block
- Confirm booking transactional: hold + quote + booking + block + outbox
- RLS: tenant A cannot read tenant B bookings
- Timezone: property `Europe/Athens` stay dates stored correctly across DST boundary
- Idempotency key duplicate hold returns same hold

### API tests

- RBAC: manager cannot cancel booking on unassigned property
- End-to-end: hold → quote → confirm → calendar shows booking

### Concurrency soak

- 50 parallel requests script (CI nightly, not every PR)

---

## 21. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Phase 1 Supabase RLS not verified | Commerce RLS inherits broken foundation | **Gate DB work on Phase 1 verification** |
| EXCLUDE + Supabase permissions | Migration fails | Verify `btree_gist` early on Supabase |
| Timezone/DST bugs | Wrong availability | Property-local DATE storage; explicit TZ port; DST test cases |
| Hold expiry drift | Double booking window | Transactional confirm re-check; short TTL |
| Decimal rounding disputes | Financial mismatch | Document rounding; store 4 dp; display 2 dp |
| Scope creep (Stripe, storefront) | Delay Phase 2 | Strict out-of-scope list; ADR-015 port only |
| Multi-unit property booking | UX confusion | Document Phase 2 single-Unit only |
| Serverless hold expiry | Missed expiries | Supabase pg_cron or dedicated worker |
| Quote/hold orphan rows | DB bloat | Expiry job + periodic cleanup audit |

---

## 22. Acceptance criteria

Phase 2 is **complete** when:

1. Operator can set availability rules and rate plan on a Unit
2. Operator can create/remove manual blocks on Unit calendar
3. `POST availability/check` returns correct result respecting rules, blocks, bookings, property timezone
4. Hold creation succeeds on free dates; second concurrent hold on same dates **fails**
5. Hold expires after TTL; dates become available again; `HoldExpired` in outbox
6. Quote from hold is immutable; total matches pricing engine
7. Booking confirmation from hold+quote is atomic; calendar shows booking; hold converted
8. **Zero** double bookings in concurrency integration test (50 parallel attempts)
9. Cancel booking releases calendar block; `BookingCancelled` in outbox
10. Calendar API returns blocks, holds, bookings for Unit
11. All commerce tables have `tenantId` + RLS; cross-tenant test fails appropriately
12. All money fields use Decimal; no float in domain or API JSON
13. Payment intent stub creates `payment_records` row without provider SDK
14. Domain packages pass ESLint boundary rules (no Prisma/Next in domain)
15. All use cases covered by unit tests; critical paths by integration tests on Supabase

**Phase 1 prerequisites (pending production verification):** Items 11 and concurrency tests additionally require Phase 1 RLS + outbox verified on Supabase.

---

## 23. Implementation order

| Step | Deliverable | DB required |
|------|-------------|-------------|
| **0** | ADR-008 through ADR-016 approved | No |
| **1** | Domain VOs: `Money`, `StayPeriod`, `LocalDate`, `QuoteSnapshot` + unit tests | No |
| **2** | `AvailabilityEvaluator`, `PricingCalculator` domain services + tests | No |
| **3** | Aggregates: `Hold`, `Quote`, `Booking`, `RatePlan`, rules + state machine tests | No |
| **4** | Ports + use case interfaces (no infra) | No |
| **5** | Validators + permissions extension | No |
| **6** | **Gate:** Phase 1 Supabase verification pass | **Yes** |
| **7** | Migration: commerce tables + EXCLUDE + RLS + `btree_gist` | Yes |
| **8** | Repositories + `ICatalogQueryPort` adapter | Yes |
| **9** | Hold + block repository (transactional) + integration tests | Yes |
| **10** | Quote use cases + immutability tests | Yes |
| **11** | Booking confirm/cancel + outbox events + integration tests | Yes |
| **12** | Expire holds job | Yes |
| **13** | Admin API routes (thin) + RBAC tests | Yes |
| **14** | Calendar read API | Yes |
| **15** | Payment stub (`IPaymentGateway` + `payment_records`) | Yes |
| **16** | Concurrency soak test on Supabase | Yes |
| **17** | Admin UI calendar (minimal) — optional stretch | Yes |

---

## Design challenges & resolutions

### Challenge 1: Property-level vs Unit-level availability

**Resolution:** Unit-only inventory (ADR-008). Property contributes timezone and optional default template copied once to Units. Rejects ambiguous “book the villa” when villa has 3 Units unless all 3 are held (Phase 3 bundle).

### Challenge 2: Single table vs multiple for blocks/bookings

**Resolution:** Single `unit_calendar_blocks` with EXCLUDE constraint simplifies overlap detection. Bookings/holds retain full aggregate rows for lifecycle; blocks are the concurrency enforcement layer.

### Challenge 3: Quote mutability pressure

**Resolution:** Strict immutability (ADR-012). Admin “edit booking price” in future = cancel + rebook workflow, not snapshot mutation.

### Challenge 4: Payment before confirm vs confirm before payment

**Resolution:** Tenant `confirmation_mode` (ADR-016). Default `manual` for Phase 2 MVP; `payment_required` path stubbed.

### Challenge 5: Phase 1 not verified on Supabase

**Resolution:** See recommendation below — split implementation tracks.

---

## Recommendation

### Is Phase 2 safe to implement before Supabase verification?

**Partially.** Phase 2 design is **architecturally sound** assuming Phase 1 contracts hold, but **full Phase 2 completion is not safe to claim** until Phase 1 Supabase verification passes (RLS, outbox, migrations, `setTenantContext`, Unit/Property reads).

### What can be implemented safely now (no Supabase dependency)

| Track | Items |
|-------|-------|
| **Design approval** | This document + ADR-008–016 |
| **Pure domain** | `Money`, `StayPeriod`, `AvailabilityEvaluator`, `PricingCalculator`, aggregates, state machines, use case signatures |
| **Domain unit tests** | All rule/pricing/booking transition tests |
| **Validators** | Zod schemas for commerce API bodies |
| **Permissions** | New permission constants and role maps |
| **Ports** | Interface definitions including `IPaymentGateway` stub contract |

These produce no production risk and are reversible.

### What must wait until Phase 1 database verification passes

| Gate | Reason |
|------|--------|
| Commerce **migrations** (especially EXCLUDE, GIST) | Requires confirmed Supabase PostgreSQL extensions and migration pipeline |
| **RLS policies** on commerce tables | Pattern unproven until Phase 1 RLS verified live |
| **Repository integration tests** | Need working `DATABASE_URL` + Phase 1 seed |
| **Concurrency / double-booking tests** | EXCLUDE behavior must run on target Supabase instance |
| **Outbox commerce events** | Depends on verified transactional outbox from Phase 1 |
| **Hold expiry worker** | Needs reliable DB scheduling on Supabase |
| **Admin API wiring to real DB** | End-to-end commerce flows |
| **Cross-tenant isolation tests** for bookings | Requires Phase 1 tenancy proof |

### Suggested program

1. **Now:** Approve Phase 2 design + ADRs; implement domain track (steps 1–5).
2. **Parallel:** Complete Phase 1 Supabase verification checklist (migrate, seed, RLS, outbox, Playwright isolation).
3. **After green Phase 1:** Execute steps 6–17 without redesign; run concurrency suite on Supabase.
4. **Do not** start Storefront API, Stripe, or widget until Phase 2 acceptance criteria 1–14 pass on Supabase.

---

**Document version:** 1.0  
**Author:** HCP Architecture  
**Next review:** After Phase 1 Supabase verification sign-off
