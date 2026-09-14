# ADR-016: Booking Confirmation Mode

## Status
Accepted

## Context
Tenants differ on whether bookings confirm immediately after hold conversion or only after payment succeeds.

## Decision
Tenant setting `confirmation_mode`:

| Mode | Initial booking status | Confirm transition |
|------|------------------------|-------------------|
| `manual` | `pending` | Operator/guest confirm → `confirmed` |
| `payment_required` | `payment_pending` | Payment capture success → `confirmed` |

Shared rules:
- Both modes: `Hold → Quote → Booking` with hold conversion in one logical flow
- `BookingStateMachine` enforces valid transitions
- `cancelled` and `completed` are terminal states
- `BookingConfirmed` event emitted on transition to `confirmed`

## Consequences
- Tenant default stored on `tenants` table (Phase 2B)
- Manual mode allows operator confirmation without payment record
- Payment-required mode blocks confirmation until gateway capture (Phase 2.5+)
