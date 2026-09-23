# ADR-024: Talos Fiscal / Billing Invariants

## Status

Accepted (F1 foundation). Some rules apply fully only in later phases — marked **(F2+)** / **(F3+)** / **(F5+)**.

## Context

Talos owns Booking → Folio → Charges → (future) Payments → Fiscal documents.
Commerce (Hold/Quote/Booking/pricing) remains reservation commerce.
Billing owns settlement truth. Fiscal (documents, myDATA, providers) is not implemented in F1.

## Decision — Constitutional invariants

1. **Booking/Quote are not the accounting ledger.** Commercial totals may inform Folio projection but are not settlement truth.
2. **Billing/Folio owns settlement truth** for guest/company balances.
3. **Payment ≠ FiscalDocument ≠ Booking.total.** (Payments F4; FiscalDocuments F3+)
4. **Posted financial lines are append-only.** No silent update/delete of posted FolioLines. Corrections use new adjustment/credit lines (and later cancel/credit documents).
5. **Issued fiscal documents will be immutable snapshots.** **(F3+)**
6. **Historical tax amounts never depend on live TaxRule rows.** Snapshots only. **(F2+)**
7. **Fiscal numbering must be atomic in PostgreSQL.** **(F3+)**
8. **Retries must never create duplicate legal documents.** **(F3+/F5+)** F1: primary folio open is idempotent via unique `(tenant_id, booking_id, folio_key)`.
9. **Provider/AADE DTOs must never enter core domain.** **(F5+)**
10. **No direct provider/AADE calls from UI/routes.** **(F5+)**
11. **Tenant isolation is mandatory** on all billing/fiscal rows (application + RLS).
12. **Fiscal monetary calculations never use JS floating point.** Use `Money` (bigint, 4dp). Currency minor-unit rounding policy deferred to F2/F3.
13. **Guest may differ from invoice recipient.** **(F2+ profiles)**
14. **Financial corrections use explicit adjustment/credit/cancellation flows**, never silent historical mutation.
15. **Source provenance is retained** for posted financial entries (`sourceType`, `sourceId`, `sourceLineRef`).

## F1 specifics

- QuoteSnapshot `feesAmount` / `taxesAmount`, when non-zero, project as **placeholder** fee/tax lines with explicit `sourceType` — **not** Greek VAT / climate fee.
- Paid amount is **not** inferred from Booking status; F1 paid = 0 (`paidAmountSource: no_allocations`).
- One Booking → N Folios via distinct `folioKey`; default key `primary`.

## F2 status

Invariants **6** (historical tax snapshots) and **13** (guest ≠ invoice recipient) are implemented — see [ADR-025](./025-tax-engine-fiscal-profiles.md).

## Consequences

Later phases must not weaken these invariants. Greek fiscalization is provider-agnostic via ports (F5/F6), not embedded in Booking.
