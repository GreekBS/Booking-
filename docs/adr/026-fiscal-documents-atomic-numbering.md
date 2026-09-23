# ADR-026: Fiscal Documents, Series, and Atomic Numbering (F3)

## Status

Accepted (F3). Extends [ADR-024](./024-fiscal-billing-invariants.md) and [ADR-025](./025-tax-engine-fiscal-profiles.md).

## Context

F1 established Folio as settlement truth. F2/F2.1 established tax evaluation and Greek jurisdiction derivation. F3 establishes Talos’s immutable fiscal-document ledger and local issuance — without AADE/myDATA transmission (F5).

## Decisions

### DRAFT vs ISSUED

- Documents start as `DRAFT` (editable/rebuildable under explicit domain rules).
- Issuance is an explicit use case that transitions to `ISSUED`.
- Future transmission states (`PENDING_TRANSMISSION`, `TRANSMITTED`, …) are reserved; F3 does not fake external states.

### Issued financial body is immutable

- After `ISSUED`, financial/legal body (parties, lines, totals, number, timestamps) cannot be edited.
- PostgreSQL triggers block mutation/deletion of issued document financial columns and line UPDATE/DELETE.
- Corrections use correlated **credit documents**, never rewrite of the original.

### Atomic PostgreSQL numbering

- `FiscalSeries.next_sequence` is advanced only inside the issue transaction via `SELECT … FOR UPDATE` + `UPDATE`.
- Number allocation and issued-document insertion occur in **one** database transaction.
- If the transaction rolls back, the allocation rolls back (no sequence gap from failed attempts).
- Once committed, a number is **never reused**.
- Uniqueness enforced by `(tenant_id, series_id, sequence_number)`.

### Idempotent issuance

- `IssueFiscalDocument` requires `issuanceIdempotencyKey` unique per tenant.
- Retries return the same ISSUED document; never allocate another sequence or duplicate lines.

### Folio ≠ FiscalDocument

- One Folio can produce multiple FiscalDocuments (partial invoicing, company vs guest, climate Special Element).
- Amount-level `fiscal_line_allocations` track coverage: unfiscalized / partially / fully fiscalized.
- Over-allocation is rejected.

### Issuer / customer snapshots

- Issued documents store immutable snapshots of BusinessFiscalProfile and CustomerBillingProfile (or minimal B2C recipient).
- Later profile edits do not alter historical documents.

### Climate Resilience Fee Special Element

- Distinct kind `CLIMATE_RESILIENCE_FEE_RECEIPT`.
- Built from F2.1 posted Folio levy daily-use snapshots — never re-runs live TaxRules.
- Not modeled as an ordinary VAT invoice line.

### AADE codes outside core domain

- Neutral kinds: `SERVICE_INVOICE`, `SERVICE_RECEIPT`, `SERVICE_CREDIT`, `RETAIL_CREDIT`, `CLIMATE_RESILIENCE_FEE_RECEIPT`.
- `GreekFiscalDocumentMapper` maps verified myDATA v2.0.2 types (2.1, 11.2, 5.1, 11.4, 8.2). Unsupported mappings fail closed.

### Local issuance ≠ AADE/provider fiscalization

- F3 issues locally only.
- Successful issue emits outbox event `FiscalDocumentIssued` — the F5 transmission boundary.
- F3 does not transmit, create MARK, or call providers.

### Rounding

- Internal totals use deterministic Money (bigint / 4dp) reconciliation.
- Provider/myDATA HALF_UP serialization remains F5/F6.

## Consequences

F4 may deepen printable/PDF and operator workflows. F5 owns FiscalizationAttempt / provider transmission persistence and consumes `FiscalDocumentIssued`.
