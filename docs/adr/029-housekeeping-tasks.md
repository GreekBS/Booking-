# ADR-029: Housekeeping & Tasks (HT-1 / HT-2 / HT-3 / HT-4)

Status: Accepted — **Housekeeping & Tasks V1 COMPLETE**  
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
- Job: `generate_housekeeping_turnover` (worker scheduler hook, **disabled by default / NOT ACTIVATED in Production**).
- Outbox: `HousekeepingBookingOutboxHandler` on `BookingConfirmed|Cancelled|StayChanged|UnitChanged`.
- Commerce mutations (`ChangeBookingStay`, cancel, confirm) emit outbox → reconciliation (idempotent).

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

### HT-3 Operator workspace

Route: `/dashboard/housekeeping` (single module; no `/dashboard/tasks`).

- **Active Property**: global context only; Today + All Tasks reload on switch.
- **Today read model**: `GET /api/admin/v1/housekeeping/today?propertyId=` — one batched query (units + HK status + day bookings + open HK tasks + overdue). Server `Property.timezone` defines `localToday`. Derived UI sections: Needs cleaning / In progress / Ready for arrivals. Dirty-without-task rows surface without GET-side repair.
- **Derived READY**: arrival today + Unit CLEAN (UI only; not persisted). Dirty + arrival today → operational attention.
- **All Tasks**: server-side filters + pagination; URL query state (`view`, `status`, `category`, `assignee`, `priority`, `page`, `taskId`, `bookingId`).
- **Manual Task workflow**: Sheet create (Active Property, defaults NORMAL/OPEN); detail sheet with Start/Unstart/Complete(+note)/Cancel/Reopen/Assign via backend state machine.
- **Manual Clean/Dirty**: secondary unit actions with CAS; Mark Clean does not complete open Tasks.
- **Manager ACL**: property-scoped list/create/mutate/HK; guessed foreign property IDs denied server-side.
- **409/CAS**: UI refreshes and surfaces conflict message; no silent retry.
- **Mobile**: card list, large Start/Complete (~390px); desktop table for All Tasks.

### HT-4 Dashboard + Booking integration

- **Dashboard**: compact Housekeeping signals (Dirty / In progress / Overdue / Ready) reuse `GET .../housekeeping/today` with Active Property; Attention links + Quick action. No duplicate KPI wall; no client-side Today recalculation.
- **Booking Workspace**: compact Operational tasks section filtered by authoritative `Task.bookingId`; open/in-progress counts; View in Housekeeping / View all / Create task deep-links. Mutations remain in Housekeeping.
- **Deep-links**: Booking → `/dashboard/housekeeping?view=all&bookingId=` (server filter); Housekeeping → `/dashboard/bookings?bookingId=`.
- **Manager privacy**: Today/list/bookingId filters cannot leak other-property work.
- **Calendar markers**: still deferred.

### V1 deferred scope

Housekeeper role, READY DB status, inspection workflow, BLOCKED, comments/attachments, recurring tasks, notifications, inventory auto-block, check-in/checkout product workflow, workforce scheduling/payroll/shifts, analytics, separate `/dashboard/tasks`, Calendar HK markers.

## Consequences

Operators get durable tasks and room readiness without coupling to channels or inventing checkout events. Worker / housekeeping scheduler Production activation remains a separate explicit step. Current Housekeeping & Tasks V1 architecture is complete for the PMS roadmap.
