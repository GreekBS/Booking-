# ADR-015: Provider-Agnostic Payments

## Status
Accepted

## Context
Phase 2 prepares for payments without coupling domain logic to Stripe, Viva, or other providers. Live capture is out of scope.

## Decision
- Define `IPaymentGateway` port in commerce domain:
  - `createIntent`, `capture`, `cancelIntent`
  - Returns provider-agnostic `PaymentIntentResult` (intentId, status, optional clientSecret)
- Domain and aggregates **never import provider SDK types**
- Phase 2 ships **stub adapter** in infrastructure only
- `payment_records` table (Phase 2B) stores provider metadata as JSON
- Booking enters `payment_pending` before `confirmed` when tenant uses payment-required mode (ADR-016)

## Consequences
- Stripe adapter added in Phase 2.5 without domain changes
- Use cases orchestrate payment intent creation after booking enters `payment_pending`
- Domain tests use confirmation modes without invoking real gateway
- **F4 (ADR-027):** Settlement truth lives on `payments` / allocations / refunds — **not** `payment_records`. Legacy `payment_records` remains the ADR-015 gateway intent ledger only; do not treat it as Folio paid balance.
- **F4.1:** `Payment.propertyId` is canonical property ownership (Active Property). Unbooked deposits are property-scoped without requiring a Booking.
