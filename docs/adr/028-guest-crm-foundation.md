# ADR-028: Guest CRM Foundation + Booking Integration

## Status

Accepted (CRM-1 foundation; CRM-2 booking integration).

## Context

Talos stored stay contact only as denormalized `bookings.guest_name/email/phone`.
`/dashboard/guests` aggregated bookings by email and was explicitly not a CRM.
`CustomerBillingProfile` is a separate fiscal invoice party (ADR-024 §13, ADR-025).

CRM-1 introduced tenant-owned Guest identity. CRM-2 wires that identity into every
supported **new** reservation create path without becoming an alternate Booking path.

## Decision

### Bounded context

`packages/domain/src/guests/` owns persistent Guest identity, normalization, and
`ResolveOrCreateGuest`. Commerce remains Booking/inventory authority (ADR-022).
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

### Identity safety (CRM-1, reused by CRM-2)

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

#### Manual / operator

- Operator enters reservation contact once; Talos auto-resolves/creates Guest
- Optional explicit `guestId` (admin schema) selects an existing active Guest after tenant validation
- Booking snapshot still comes from the confirmed reservation contact, not live CRM overwrite
- Rich Guest search UI deferred to CRM-3

#### Direct / storefront

- Public clients must not supply `guestId` (route reject + use-case Forbidden)
- Identity resolved only from validated contact inputs server-side
- Hold/Quote/Booking inventory semantics unchanged

#### Channel CREATE / retry / placeholder

- CREATE: resolve/create from normalized contact; link new Booking
- Duplicate external reservation (early link or unique race): return duplicate **without** new Guest
- Placeholder emails never merge distinct OTA humans; each reservation without strong identity gets a distinct Guest; retries reuse Booking/Guest via ChannelImportKey idempotency

### Enrichment policy (CRM-2)

**Conservative — MATCHED Guests are not overwritten by new booking snapshots.**

- On `MATCHED`: leave living Guest profile unchanged
- On `CREATED` / `AMBIGUOUS`: new Guest is seeded from the reservation contact
- Missing/placeholder OTA contact must not erase trusted CRM email/phone
- Conflicting contact remains on the Booking snapshot; future CRM-4 may reconcile

### Recovery use case

`LinkBookingToGuestUseCase` links an unlinked Booking to an accessible Guest:

- same tenant, Booking property ACL, Guest active
- idempotent same-link; conflicting existing link fails closed
- no broad unlink/relink UI in CRM-2

### Authorization

| Permission | Admin / SA Open | Manager |
|------------|-----------------|---------|
| `guest:read:tenant` | yes | no |
| `guest:read:assigned` | — | yes |
| `guest:create:tenant` | yes | no |
| `guest:update:tenant` | yes | no |

Booking-create Guest resolution uses `executeForBookingCreate`, authorized by
`booking:create:tenant` (or Guest admin). Managers are **not** granted
`guest:create:tenant` merely to complete a reservation.

Manager privacy: linking the same Guest across properties is allowed when strong
resolution proves identity, but resolution results exposed to restricted actors
must not leak other Properties’ booking/payment/fiscal history.

### RLS

`guests`: ENABLE + FORCE RLS; tenant isolation via `app.current_tenant`.
`talos_runtime` remains non-BYPASSRLS.

### Reservation Workspace (CRM-2 minimal)

Booking Workspace → Guest & Billing shows reservation contact snapshot plus
Linked Guest identity (displayName / email / phone when authorized). No fake
Guest Profile route until CRM-3.

### Explicit non-goals

Full Directory/Profile UI, notes, tags, merge UI, privacy export, consent,
occupants, Guest↔CustomerBillingProfile FK, Payment.guestId, LTV, messaging,
AI/fuzzy matching (CRM-3/4).

## Consequences

- CRM-3 builds Guest Directory/Profile on trustworthy Guest↔Booking data
- CRM-4 merge + privacy hardening
- Historical demo backfill (CRM-1) + new creates (CRM-2) feed the CRM
