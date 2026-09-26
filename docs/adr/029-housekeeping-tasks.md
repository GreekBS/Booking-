# ADR-029: Housekeeping & Tasks (HT-1 / HT-2)

Status: Accepted  
Date: 2026-09-26

## Context

Talos needs first-class operational housekeeping after Guest CRM (CRM-3). Commerce already owns inventory and bookings. There is no checkout timestamp or checkout API — only scheduled `Booking.checkOut` dates and Property timezone.

## Decision

### Bounded context

`packages/domain/src/operations/` — operational work, not Commerce inventory.

### Task aggregate

Generic Task with categories: `HOUSEKEEPING | MAINTENANCE | INSPECTION | GUEST_REQUEST | GENERAL`.

Statuses: `OPEN → IN_PROGRESS → COMPLETED`, cancel from OPEN/IN_PROGRESS, reopen COMPLETED→OPEN (clears completion fields). CANCELLED is terminal. No BLOCKED.

Priority: `NORMAL | HIGH | URGENT` (display/sort only).

Optimistic concurrency via `version` CAS.

### Unit housekeeping status

Persisted one row per Unit: `CLEAN | DIRTY` only.  
“In progress” is derived: Unit DIRTY + HOUSEKEEPING Task IN_PROGRESS.

Initialized CLEAN on migration backfill and on Unit create (`CreateProperty` / `AddUnit`).

### Inventory separation

Housekeeping NEVER mutates calendar blocks, availability, holds, quotes, or bookings.  
`CalendarBlockType.cleaning|turnover` remain inventory-only and are not HK state.

### Turnover automation

- Trigger: scheduled `checkOut` vs **Property.timezone** local today (authoritative; default `Europe/Athens`).
- Window: `[today - 7 days, today]` property-local; coarse UTC candidate query then TZ filter.
- Job: `generate_housekeeping_turnover` (worker scheduler hook, **disabled by default**).
- Outbox: `HousekeepingBookingOutboxHandler` on `BookingConfirmed|Cancelled|StayChanged|UnitChanged`.

### Stable source identity

Normal: `source=TURNOVER`, `sourceKey=turnover:{bookingId}`  
Invariant: one active canonical turnover intent per Booking.

When OPEN: reconcile `dueAt` / `unitId` / `propertyId` in place.

When IN_PROGRESS or COMPLETED and stay/unit diverges: retire key to  
`turnover:{bookingId}:history:{taskId}`, preserve history, create new canonical OPEN.

Cancellation: cancel OPEN/IN_PROGRESS turnover tasks; do not mark Unit DIRTY.

Completed stay match: do not re-DIRTY on job replay.

### Permissions

`task:read|create|update:tenant|assigned`, `task:assign:tenant`,  
`housekeeping:update:tenant|assigned`.  
No Housekeeper role in V1. Managers restricted to assigned properties.

### RLS

`tasks` and `unit_housekeeping_statuses`: ENABLE + FORCE RLS, tenant GUC policies, grants to `talos_runtime`.

### HT-3 / HT-4 boundaries

HT-3: `/dashboard/housekeeping` UI.  
HT-4: Dashboard chips, Booking strip, optional calendar markers.  
Deferred: notifications, attachments, recurrence, READY≠CLEAN, inspection workflow.

## Consequences

Operators get durable tasks and room readiness without coupling to channels or inventing checkout events. Worker Production activation remains a separate explicit step.
