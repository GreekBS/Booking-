# ADR-027: Payments, Allocations, Refunds, and Folio Settlement (F4)

**Status:** Accepted  
**Date:** 2026-09-24  
**Depends on:** ADR-013 (Money), ADR-015 (gateway boundary), ADR-024 (billing invariants), ADR-026 / F3.1 (TX locks + `talos_runtime`)

## Context

F1 opened Folios with `paidAmount = 0` / `paidAmountSource: "no_allocations"`.  
F3 fiscalized Folio lines without implying cash settlement.  
Operators and future gateways need a canonical ledger for money movement that is **not** Booking confirmation and **not** FiscalDocument issuance.

## Decision

### Separations

| Concept | Owns |
|---------|------|
| **Payment** | Money movement (amount, method, collection source, status) |
| **PaymentAllocation** | Which Folio balance a Payment settles |
| **PaymentAllocationReversal** | Append-only undo of settlement (never mutate/delete allocations) |
| **Refund** | Return of money against a Payment |
| **FiscalDocument** | Legal fiscalization (unchanged by payment events) |
| **`payment_records` (legacy)** | ADR-015 gateway intent scaffold only — not settlement truth |

`Payment ≠ Booking ≠ Folio ≠ FiscalDocument`.

### Collection source

`DIRECT | PROPERTY | OTA | PAYMENT_GATEWAY | OTHER` records **who collected** cash.  
OTA booking totals never auto-create Payments.

### Property ownership (F4.1)

`Payment.propertyId` is required and canonical.  
Active Property is UX default only.  

- Unbooked / unallocated payments are listed by `propertyId`.  
- If `bookingId` is set: `Payment.propertyId` MUST equal `Booking.propertyId` (fail closed).  
- Allocation to a Folio requires Folio/Booking property = Payment.propertyId.

### Settlement math

- Folio **net settled** = Σ(allocations to folio) − Σ(reversals of those allocations)  
- Folio **outstanding** = max(0, folioTotal − netSettled)  
- Folio **overpayment** = max(0, netSettled − folioTotal)  
- Payment **available** = amount − allocatedNet − succeededRefunds  
- Payment **refundable** = amount − succeededRefunds  

Only `SUCCEEDED` refunds affect settlement. `PENDING`/`FAILED`/`CANCELLED` do not.

### Refund ↔ Folio

When a refund exceeds unallocated Payment balance, F4 creates FIFO `PaymentAllocationReversal` rows in the same TX so Folio outstanding is restored without rewriting history.

### Concurrency (PostgreSQL-authoritative)

Atomic repository methods (`recordPaymentAtomic`, `allocateAtomic`, `reverseAllocationAtomic`, `refundAtomic`):

1. `withTenantTransaction` + SET LOCAL `app.current_tenant`  
2. `SELECT … FOR UPDATE` on Payment (and Folio / Allocation as needed) in deterministic id order  
3. Re-read sums; domain asserts; persist  

No cross-row SUM CHECK constraints.

### Idempotency

`@@unique(tenantId, idempotencyKey)` on Payments and Refunds.  
Same key + identical payload → same Payment.  
Same key + conflicting amount/currency/method/source/booking → fail closed.

### Currency

No FX in F4. Mismatched currencies fail closed.

### Sensitive data

Never store PAN, CVV, magnetic stripe data, or provider secret tokens.  
Only provider references / externalReference strings.

### Gateway boundary

`IPaymentGateway` (ADR-015) remains for future F5+ adapters (`createIntent` / capture / webhook).  
F4 does not call external providers.

### RLS

Tables use ENABLE + FORCE RLS with `app.current_tenant`.  
Runtime role: `talos_runtime` (non-BYPASSRLS).

## Consequences

- Booking UI shows real settlement from allocations/reversals.  
- Live Viva/Stripe/Worldline integration is explicitly out of F4.  
- Legacy `payment_records` rows are preserved unused by settlement; future capture posting may link via metadata/`externalReference`.
