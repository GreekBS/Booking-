# ADR-028: Guest CRM Foundation (CRM-1)

## Status

Accepted (CRM-1).

## Context

Talos stored stay contact only as denormalized `bookings.guest_name/email/phone`.
`/dashboard/guests` aggregated bookings by email and was explicitly not a CRM.
`CustomerBillingProfile` is a separate fiscal invoice party (ADR-024 §13, ADR-025).

## Decision

### Bounded context

`packages/domain/src/guests/` owns persistent Guest identity, normalization, and
`ResolveOrCreateGuest`. Commerce remains Booking/inventory authority (ADR-022).
Billing/Fiscal remain settlement/document authorities.

### Ownership

Guest is **tenant-owned**, not property-owned. Property activity is derived via
Bookings. Active Property is UX/filter context only.

### Booking linkage

- `bookings.guest_id` nullable FK → `guests.id`
- Reservation contact snapshots (`guest_name/email/phone`) remain historical evidence
- Editing Guest never rewrites Booking snapshots or fiscal documents

### Identity safety

**False duplicates > false merges.**

- Email and phone are **not** unique
- Never match on name alone
- Reject synthetic emails (`*@invalid.talos.local`)
- Decision table (see `ResolveOrCreateGuest`):
  - usable email + one compatible name candidate + no phone conflict → `MATCHED`
  - conflicting name/phone or multiple candidates → `AMBIGUOUS` → create separate Guest
  - no usable email/phone → `CREATED`
- Concurrent resolve uses tenant-scoped advisory locks on identity keys (not uniqueness)

### Authorization

| Permission | Admin / SA Open | Manager |
|------------|-----------------|---------|
| `guest:read:tenant` | yes | no |
| `guest:read:assigned` | — | yes |
| `guest:create:tenant` | yes | no |
| `guest:update:tenant` | yes | no |

Manager may read Guest identity only when they have authorized activity on an
assigned Property. They must not see other Properties’ reservations/payments/fiscal
activity. Notes/tags visibility for Managers is deferred to CRM-3.

### RLS

`guests`: ENABLE + FORCE RLS; tenant isolation via `app.current_tenant`.
`talos_runtime` remains non-BYPASSRLS.

### Explicit non-goals (CRM-1)

Directory/Profile UI, notes, tags, merge UI, privacy export, consent, occupants,
Guest↔CustomerBillingProfile FK, LTV, channel/manual/storefront auto-wire (CRM-2).

## Consequences

- CRM-2 wires resolve into new booking paths
- CRM-3 replaces Guests page with real directory/profile
- CRM-4 merge + privacy hardening
- Historical demo backfill uses the same resolver rules
