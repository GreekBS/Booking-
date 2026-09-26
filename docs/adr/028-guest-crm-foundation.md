# ADR-028: Guest CRM Foundation + Booking Integration + Operator Experience

## Status

Accepted (CRM-1 foundation; CRM-2 booking integration; CRM-3 operator experience).

## Context

Talos stored stay contact only as denormalized `bookings.guest_name/email/phone`.
`/dashboard/guests` aggregated bookings by email and was explicitly not a CRM.
`CustomerBillingProfile` is a separate fiscal invoice party (ADR-024 §13, ADR-025).

CRM-1 introduced tenant-owned Guest identity. CRM-2 wires that identity into every
supported **new** reservation create path without becoming an alternate Booking path.
CRM-3 replaces the booking-derived Guests page with a real Guest Directory and Profile.

## Decision

### Bounded context

`packages/domain/src/guests/` owns persistent Guest identity, normalization,
`ResolveOrCreateGuest`, directory/profile queries, Notes, and Tags.
Commerce remains Booking/inventory authority (ADR-022).
Billing/Fiscal remain settlement/document authorities.

### Ownership

Guest is **tenant-owned**, not property-owned. Property activity is derived via
Bookings. Active Property is UX/filter context only.

### Booking linkage

- `bookings.guest_id` nullable FK → `guests.id` (column remains nullable for recovery)
- Application invariant for supported NEW creates with primary contact:
  successful Booking → `guestId` present
- Reservation contact snapshots (`guest_name/email/phone`) remain historical evidence
- Editing Guest never rewrites Booking snapshots or fiscal documents

### Identity safety (CRM-1, reused by CRM-2/3)

**False duplicates > false merges.**

- Email and phone are **not** unique
- Never match on name alone
- Reject synthetic emails (`*@invalid.talos.local`) as identity evidence
- Ambiguous resolution during booking → create a **separate** Guest and still allow the reservation
- Concurrent resolve uses tenant-scoped advisory locks on identity keys (not uniqueness)

### CRM-2 booking integration

Guest resolution is **never** an alternate Booking creation path.

| Path | Resolve location | Transaction boundary |
|------|------------------|----------------------|
| Manual / operator (`CreateBookingUseCase`) | `executeForBookingCreate` inside `ICommerceFlowRepository.runInTenantTransaction` before `saveHoldAndBooking` | Guest upsert + Booking/Hold persist share one tenant TX (ALS nesting) |
| Direct / storefront (`CreateBookingUseCase`) | Same as manual; server-side only | Same |
| Channel CREATE (`ImportChannelReservationCommandUseCase` / CM-3b-3) | Inside `IChannelReservationImportPersistencePort.runInTenantTransaction` immediately before `commitImport` | Guest + Hold/Quote/Booking + ExternalReservationLink share one TX |
| Channel MODIFY | **No** Guest create/resolve | Uses existing Booking / link; preserves existing `guestId` |
| Channel CANCEL | **No** Guest create/update | Operates on existing Booking only |

Transport / provider / inbox layers remain CRM-unaware (ADR-022).

### CRM-3 Guest Directory

Source of truth: `guests` table + `bookings.guest_id` (not email aggregation).

- Route: `/dashboard/guests`
- Default scope: Guests with Booking activity at **Active Property**
- Admin secondary option: Entire tenant
- Manager: assigned Property activity only; server-side filtering before results leave
- Server-side search (displayName / email / phone) + pagination
- Metrics (`stayCount`, `lastStay`, `nextStay`) computed **only** from actor-visible bookings
- Bounded SQL aggregation (no N+1 per Guest)

### CRM-3 Guest Profile

Route: `/dashboard/guests/[guestId]`

Sections: Overview, Reservations (`Booking.guestId`), Notes, Tags in header.
No inferred CustomerBillingProfile / Payment.payerName linkage.
Reservation Workspace links to profile when `linkedGuest` is authorized.

### Guest edit semantics

Editable: displayName, firstName, lastName, email, phone, country, preferredLanguage.
Does **not** mutate Booking snapshots, Billing, Payment, or Fiscal documents.
Archived / merged / anonymized Guests are not selectable for new reservations.

### Notes visibility model

Table: `guest_notes`

| `propertyId` | Visibility |
|--------------|------------|
| `null` | Tenant-wide admin note — Admin / SA only |
| Property A | Admin + Managers authorized for Property A |

Manager creates notes with `propertyId` required and assigned.
Permissions: `guest:note_create:tenant`, `guest:note_create:assigned`.

### Tags

Tables: `guest_tags`, `guest_tag_assignments`

- Tenant-owned manual definitions (Admin / SA manage + assign)
- Manager may **view** tags on Guests they can access
- Derived facts (Returning Guest, channel source) are **not** persisted as tags

### Manual Booking Guest selection

Operator may search/select existing Guest → prefill contact → submitted values become Booking snapshot.
Server validates Guest ID (tenant, usable, ACL). Public clients still cannot supply `guestId`.

### Authorization

| Permission | Admin / SA Open | Manager |
|------------|-----------------|---------|
| `guest:read:tenant` | yes | no |
| `guest:read:assigned` | — | yes |
| `guest:create:tenant` | yes | no |
| `guest:update:tenant` | yes | no |
| `guest:note_create:tenant` | yes | no |
| `guest:note_create:assigned` | — | yes |
| `guest:tag_manage:tenant` | yes | no |

Booking-create Guest resolution uses `executeForBookingCreate`, authorized by
`booking:create:tenant` (or Guest admin). Managers are **not** granted
`guest:create:tenant` merely to complete a reservation.

### RLS

`guests`, `guest_notes`, `guest_tags`, `guest_tag_assignments`:
ENABLE + FORCE RLS; tenant isolation via `app.current_tenant`.
Manager Property ACL is enforced in the application layer.

### Explicit non-goals (CRM-4)

Guest merge, duplicate-management UI, privacy export/anonymization workflow,
consent, marketing, loyalty, AI/fuzzy matching, passport storage, occupants,
Guest↔CustomerBillingProfile FK, Payment.guestId, LTV/revenue, messaging.

## Consequences

- CRM-4 merge + privacy hardening builds on CRM-3 directory/profile data
- Channel architecture unchanged in CRM-3
