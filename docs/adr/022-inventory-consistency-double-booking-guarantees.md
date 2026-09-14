# ADR-022: Inventory Consistency & Double Booking Guarantees

## Status

Accepted

**Implementation note:** Foundational inventory layers (unit calendar blocks, PostgreSQL EXCLUDE, Commerce booking persistence) are in production. **CM-3c channel ingress** (`ChannelInboxItem`, `ReceiveChannelEventUseCase`, `ProcessChannelInboxItemUseCase`, `ReplayChannelInboxItemUseCase`, `process_channel_inbox` job) is **implemented** in domain and database packages; transport adapters (webhook/poll HTTP) and OTA provider bundles remain future work.

## Context

The platform is a multi-tenant PMS with a production-grade Channel Manager roadmap (Booking.com, Airbnb, Expedia, Vrbo, iCal, and future providers). Inventory must remain consistent as new ingress paths, APIs, bulk tools, and replay workflows are added over time.

ADR-009 and ADR-010 established the **unit calendar block model** and the **PostgreSQL EXCLUDE constraint** as the database-level inventory lock. ADR-020 established `ReservationOrchestrator` as the commerce coordination façade. CM-3c establishes the **channel ingress pipeline** (Receive → Inbox → Background Jobs → CM-3a → CM-3b-3 → Commerce).

Without a single permanent document, future features may reintroduce shortcuts — direct provider-to-commerce calls, replay paths that skip validation, or booking creation that bypasses EXCLUDE — and silently erode the zero double-booking guarantee.

This ADR is the **constitutional** document for inventory consistency and double-booking prevention. It applies to all current and future booking-creation paths.

## Decision

### 1. Single source of inventory truth

| Responsibility | Owner | Authority |
|----------------|-------|-----------|
| Inventory state (`UnitCalendarBlock`) | **Commerce** | Source of truth |
| Availability preview / validation | `ReservationOrchestrator` + `AvailabilityEvaluator` | **Advisory** — reads current state before prepare/commit |
| Concurrent inventory lock at commit | PostgreSQL `EXCLUDE` on `unit_calendar_blocks` | **Authoritative** — serializes overlapping writes |

**Permanent rule:**

> **If `ReservationOrchestrator` and PostgreSQL disagree, PostgreSQL always wins.**

The orchestrator and availability engine may report availability based on a snapshot read before commit. Under concurrency, two workers can both pass advisory checks. Only the EXCLUDE constraint guarantees that at most one overlapping active `hold` or `booking` block exists per `unit_id` at commit time.

Commerce owns inventory. Channels synchronizes external state **into** Commerce; Channels never owns inventory or reservation state.

See also: ADR-009 (calendar block model), ADR-010 (EXCLUDE mechanism), ADR-020 (orchestrator role).

---

### 2. Zero double-booking policy

The platform has **zero tolerance for technical double booking** — two confirmed bookings (or hold + booking) occupying overlapping stay periods on the same unit.

This guarantee is **not** provided by any single layer. It exists because **complementary layers work together**:

| Layer | Role | Sufficient alone? |
|-------|------|-------------------|
| **Channel Inbox** | Durable, append-only provider evidence; ingress deduplication | No — optimization only |
| **Idempotent processing** | Background job idempotency; inbox deduplication keys | No — reduces duplicate work |
| **Lease ownership** | At most one worker processes a given inbox item concurrently | No — prevents duplicate processing, not inventory races |
| **`ExternalReservationLink` uniqueness** | Idempotent import per `(connectionId, externalReservationId)` | No — prevents duplicate links, not concurrent first imports |
| **CM-3a validation** | Dry-run mapping, availability, and business gates before commit | No — advisory; race window remains |
| **CM-3b-3 atomic commit** | Single transaction: hold, quote, booking, calendar block, outbox, link | No — two transactions can still race |
| **Commerce transaction** | Aggregate + calendar block written atomically within one TX | No — two TXs can still race |
| **PostgreSQL EXCLUDE** | Authoritative mutual exclusion at commit | **Yes** — final authority |

**Concurrent commit guarantee:**

When two imports (or any two booking-creation transactions) attempt overlapping dates on the same unit:

1. One transaction **succeeds** — booking, calendar block, and related rows commit atomically.
2. One transaction **fails** with an EXCLUDE violation.
3. The failed transaction **rolls back completely** — no `Booking`, no `ExternalReservationLink`, no partial hold, quote, block, or outbox state.
4. **Therefore no technical double booking** on that unit for those overlapping dates.

No single layer is sufficient. The guarantee holds because all layers operate together.

---

### 3. Idempotent booking mutations (at-least-once)

The platform assumes **at-least-once delivery** for all external and internal triggers — not only channel CREATE events. Duplicate delivery, retries, worker reclaim, replay, and concurrent workers are **normal operating conditions**, not exceptional errors.

#### Permanent rule

> **Every operation that mutates booking or inventory state must be safe under repeated execution.**

This applies to all current and future booking mutations, including but not limited to:

| Operation | Context (examples) |
|-----------|-------------------|
| **CREATE** | OTA import, storefront checkout, manual booking, replay |
| **MODIFY** | OTA stay change, operator amend, future channel modify |
| **CANCEL** | OTA cancellation, operator cancel, future channel cancel |
| **CONFIRM** | Manual confirmation, payment-confirmed booking |
| **REOPEN** | Future lifecycle transitions |
| **RE-SYNC** | Provider reconciliation, sync jobs |
| **REPLAY** | Operator or system resubmission via ingress |
| **Any future mutation** | Must be reviewed against this rule before approval |

The goal is **not** "prevent duplicate messages." The goal is:

> **Executing the same mutation any number of times must not corrupt booking state or produce duplicate inventory commitments.**

The idempotency **mechanism** varies by operation; the **principle** is permanent.

#### Scope

This rule covers mutations that affect:

- `Booking` lifecycle or stay assignment
- `UnitCalendarBlock` inventory geometry
- `ExternalReservationLink` sync metadata (identity fields remain immutable per link invariants)
- Any future reservation-side aggregate written in the same transaction as booking/inventory

Read-only operations (availability preview, CM-3a dry-run, catalog queries) are out of scope but should not be mistaken for mutation paths.

#### Relationship to CREATE-specific pipeline

Channel CREATE implements this principle through the approved ingress pipeline:

`ReceiveChannelEventUseCase` → Inbox → Background Jobs → CM-3a → CM-3b-3 → atomic commit → link uniqueness → PostgreSQL EXCLUDE

Future MODIFY, CANCEL, and other channel operations **must implement the same principle** through the same ingress and pipeline rules. They may use additional ordering metadata (`providerRevision`, `providerSequence`, `providerEventTime`) to reject stale events, but they **must not** rely on exactly-once delivery from providers.

Non-channel mutations (storefront, operator UI, internal APIs) must implement equivalent idempotency at the application and persistence layers — command idempotency keys, aggregate status guards, and EXCLUDE-protected commits where inventory changes.

#### Idempotent outcomes

Repeated execution must produce a **defined terminal outcome**, not undefined behaviour:

| Outcome category | Meaning |
|------------------|---------|
| **Applied** | Mutation committed; state changed once |
| **Already applied / duplicate** | Mutation or equivalent already committed; no further inventory effect |
| **Rejected (stale)** | Event superseded by newer revision; no state change |
| **Rejected (conflict)** | Inventory or business rule prevents mutation; no partial state (e.g. EXCLUDE failure → full rollback) |

Terminal duplicate and already-applied outcomes are **successful terminal outcomes**, not errors, under at-least-once delivery.

#### Inventory authority unchanged

Idempotency does not shift inventory authority. For any mutation that changes stay geometry on a unit:

- Application and orchestrator checks remain **advisory**
- **PostgreSQL EXCLUDE** remains the **authoritative** concurrent inventory lock
- Failed commits roll back **completely** — no partial booking, link, or calendar block

#### Review requirement

Any new booking mutation must pass the ADR-022 review checklist **and** document:

1. Its idempotency key or guard (what makes a replay safe)
2. Its terminal outcomes under duplicate execution
3. Its transaction boundary and EXCLUDE interaction
4. Its concurrency/chaos validation evidence before production readiness

---

### 4. Mandatory booking pipeline

Every feature capable of **creating a booking** must pass through the same approved architectural pipeline.

**Approved pipeline (conceptual):**

```
Ingress (provider-specific adapter)
    ↓
ReceiveChannelEventUseCase          [only public channel ingress]
    ↓
Persist Inbox (immutable evidence)
    ↓
ACK provider                        [before async processing]
    ↓
Background Jobs
    ↓
ProcessChannelInboxItemUseCase
    ↓
CM-3a (dry run / validation)
    ↓
CM-3b-3 (atomic import commit)
    ↓
Commerce (PrepareReservationUseCase / ReservationOrchestrator)
    ↓
PostgreSQL EXCLUDE
    ↓
ExternalReservationLink
```

**This rule applies without exception to:**

- Booking.com, Airbnb, Expedia, Vrbo, and all future OTA providers
- iCal and calendar-feed imports
- Manual channel imports
- Future public or internal APIs that create bookings from external sources
- Bulk imports
- Replay and reprocessing of inbox items
- Reconciliation jobs, migration utilities, support scripts, CLI tools, and internal services that create bookings from external or channel-originated sources
- Any future integration not yet designed

Non-channel booking creation (e.g. storefront checkout, operator manual booking) follows the **Commerce path** through `ReservationOrchestrator` and the same EXCLUDE-protected persistence layer. Channel-specific stages (Inbox, CM-3a, CM-3b-3, `ExternalReservationLink`) apply when the booking originates from a channel provider.

**No future feature may bypass the approved booking pipeline.**

---

### 4.1 Absolute transport isolation (mandatory)

> **All channel transport entry points may depend on only one application ingress use case: `ReceiveChannelEventUseCase`.**

This is a **mandatory constitutional rule**, not a recommendation.

It applies to:

- Webhook handlers
- Polling jobs
- Provider SDK wrappers
- Booking.com, Airbnb, Expedia, Vrbo, iCal, and all future provider adapters
- Internal APIs that receive external reservation events

Transport code must **never** call directly:

- CM-3a (`ImportChannelReservationCreateDryRunUseCase`)
- CM-3b-3 (`ImportChannelReservationCommandUseCase`)
- `PrepareReservationUseCase`
- `CreateReservationUseCase`
- `ReservationOrchestrator`
- Booking repositories
- Commerce repositories

Transport may use infrastructure concerns (HTTP, credential resolution, poll cursor repositories) and stateless provider bundles (`verify`, `parse`, fetch). All reservation ingress must terminate at `ReceiveChannelEventUseCase`.

Operator replay via `ReplayChannelInboxItemUseCase` is permitted only from admin/operator tooling — not from transport adapters.

---

### 4.2 Reconciliation, support tools, and internal services (mandatory)

> **Reconciliation jobs, migration utilities, support scripts, CLI tools, and internal services must never create Bookings directly.**

They may:

- Inspect state
- Compare provider and platform data
- Update non-identity synchronization metadata when explicitly allowed
- Report inconsistencies
- Request replay (via `ReplayChannelInboxItemUseCase` or equivalent operator flow)

They must **not**:

- Call booking repositories directly
- Call Commerce creation use cases directly
- Create calendar blocks
- Create `ExternalReservationLink` rows manually
- Bypass Inbox, CM-3a, CM-3b-3, or PostgreSQL EXCLUDE

If reconciliation discovers a missing external reservation that requires Booking creation, it must submit the event through the mandatory pipeline:

```
ReceiveChannelEventUseCase
    → Inbox
    → Background Jobs
    → CM-3a
    → CM-3b-3
    → Commerce
    → PostgreSQL EXCLUDE
```

---

### 5. Forbidden architectural shortcuts

The following patterns are **explicitly forbidden**. They are architectural anti-patterns, not acceptable shortcuts for speed or convenience.

| Anti-pattern | Why forbidden |
|--------------|---------------|
| Provider → Commerce directly | Bypasses Inbox evidence, idempotency, lease model, and CM validation |
| Provider → `ReservationOrchestrator` directly | Bypasses channel ingress and import idempotency |
| Provider → CM-3a / CM-3b-3 without Inbox | Bypasses durable evidence and async processing contract |
| Receive → CM-3a → CM-3b-3 → ACK | ACK must follow Inbox persist, not booking commit |
| Replay → `Booking` repository directly | Bypasses validation and EXCLUDE-protected commit path |
| Admin import → `IBookingRepository` directly | Bypasses pipeline and link consistency |
| Adapter → `IBookingRepository` directly | Same |
| Transport → CM-3a / CM-3b-3 / Commerce / booking repositories directly | Violates §4.1 absolute transport isolation |
| Reconciliation job → booking repository | Bypasses Inbox evidence and EXCLUDE-protected commit |
| Support script → booking repository | Same |
| Migration tool → direct booking or calendar-block insert | Same |
| Any booking creation that bypasses CM-3a / CM-3b-3 / Commerce pipeline | Skips layered validation and atomic commit |
| Any path that bypasses PostgreSQL EXCLUDE | Removes authoritative inventory lock |
| Mutating `ExternalReservationLink` identity after creation | Identity (`connectionId`, `externalReservationId`, `bookingId`, `mappingVersionAtImport`) is immutable; updates use MODIFY/CANCEL flows |

Code review, architecture review, and ADR amendments must reject designs that introduce these shortcuts.

---

### 6. Future architecture review rule

Whenever a new feature **can create or mutate a `Booking`** (or otherwise change inventory on a unit), reviewers must verify all of the following before implementation is approved:

| Question | Required answer |
|----------|-----------------|
| Does it enter through the approved ingress? | **Yes** |
| Does the transport layer depend only on `ReceiveChannelEventUseCase` for reservation ingress? | **Yes** |
| Does it preserve Inbox guarantees (immutable evidence, ACK-before-async for channel events)? | **Yes** |
| Does it preserve idempotency (inbox dedup, job idempotency, link uniqueness)? | **Yes** |
| Does it preserve atomic persistence (single TX for commerce writes + link where applicable)? | **Yes** |
| Does it preserve `ExternalReservationLink` consistency (identity immutability, uniqueness)? | **Yes** |
| Does it preserve PostgreSQL EXCLUDE protection (calendar block in same TX as booking)? | **Yes** |
| Is the mutation safe under repeated execution, with an idempotency key or guard documented? | **Yes** |

**If the answer to any question is "no", the design must be reconsidered before implementation.**

This checklist applies to pull requests, design documents, and new ADRs. Exceptions require a new ADR that explicitly supersedes or amends this one — silent exceptions are not permitted.

## Consequences

- **Long-term integrity:** New providers, APIs, and bulk flows inherit the same guarantees without rediscovering constraints ad hoc.
- **Clear authority:** Engineers know Commerce owns inventory and EXCLUDE is final — no debate at implementation time.
- **Review discipline:** The eight-question checklist becomes a standard gate for any booking-creation or booking-mutation feature.
- **Transport isolation:** All channel transport entry points may depend only on `ReceiveChannelEventUseCase` for reservation ingress (§4.1).
- **Reconciliation and tooling:** Scripts, migration utilities, and reconciliation jobs must not create bookings directly; missing reservations must enter through Receive (§4.2).
- **Idempotent mutations:** CREATE, MODIFY, CANCEL, and all future booking mutations must be safe under at-least-once delivery; duplicate terminal outcomes are success, not failure.
- **Relationship to ADR-010:** ADR-010 documents the EXCLUDE mechanism; this ADR documents the full layered policy and mandatory pipeline. Both remain in force; neither supersedes the other.
- **Channel Manager growth:** CM-3c and future CM phases (MODIFY, CANCEL, export) must remain aligned with this ADR. Outbound availability export does not create bookings and is out of scope here, but inbound reservation events always follow §4.
- **Operational classification:** Availability conflicts detected via EXCLUDE (e.g. `AVAILABILITY_CONFLICT` outcome) are expected under concurrency; they are not double bookings and must not be retried automatically into duplicate commit attempts.

## References

- ADR-009: Unit Calendar Block Model
- ADR-010: Double-Booking Prevention Strategy
- ADR-020: Reservation Orchestrator and Stay Change Architecture (`docs/architecture/ADR-020-reservation-orchestrator.md`)
- `packages/domain/src/channels/ARCHITECTURE.md` — Channels bounded context and CM phases
- CM-3c architecture — Channel ingress (Receive → Inbox → Jobs → CM-3a → CM-3b-3 → Commerce → EXCLUDE)
