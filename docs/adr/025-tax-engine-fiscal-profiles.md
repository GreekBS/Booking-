# ADR-025: Tax Engine, Statutory Rules, and Fiscal Profiles (F2)

## Status

Accepted (F2). Extends [ADR-024](./024-fiscal-billing-invariants.md).

## Context

F1 established Folio as settlement truth with append-only lines. F2 adds tax calculation and fiscal identity without fiscal documents, myDATA, or provider calls.

## Decisions

### Effective-dated statutory TaxRules

- Tax behavior lives in `TaxRule` catalog data, not in Commerce/Booking/Quote/RatePlan.
- Platform statutory Greek rules are versioned in domain seed (`greekStatutoryTaxRules`) with `legalSource` / `legalVersion`.
- Future law changes → **new rules** with new `validFrom` (never rewrite history).
- Tenant commercial rules may exist but **cannot override** platform statutory matches (`resolveTaxRule`).

### Historical tax snapshot immutability

- Posted Folio tax/levy lines carry an immutable `taxSnapshot` JSON.
- Historical amounts never re-read live TaxRule rows.
- Corrections use explicit adjustment/credit FolioLines (F1 invariant 14).

### Jurisdiction-aware VAT

- `BusinessFiscalProfile.fiscalJurisdiction` is operator-assigned (e.g. `GR`, `GR-ISLAND-REDUCED`).
- TaxEngine never hardcodes island names or geography eligibility.
- Island reduced rates (30% cut → 13%→9%, 24%→17%) are seeded for `GR-ISLAND-REDUCED` per AADE E.2113/2025 / VAT Code Art. 26 — eligibility remains an operator legal decision.

### Fail-closed resolution

- Missing required rule → `ValidationError`.
- Ambiguous equal-priority matches → `ConflictError`.
- Missing hotel star / classification for climate fee → fail closed.

### Climate Resilience Fee ≠ VAT

- Distinct `taxType: climate_resilience_fee`.
- Snapshot metadata includes `requiresSeparateFiscalDocument: true` and hint
  `climate_resilience_fee_special_element` for F3
  (“Special Element – Receipt for Collection of the Climate Resilience Fee”).
- Complimentary stays: levy amount **0**, but `totalDailyUses` / `complimentaryDailyUses` / `taxableDailyUses` retained for reporting.

### Fiscal profile ≠ Guest

- `CustomerBillingProfile` is separate from Booking guest.
- INDIVIDUAL profiles are not forced to have AFM; BUSINESS (GR) requires AFM format.

### Tax calculation ≠ fiscalization

- Evaluating/posting Folio taxes does **not** issue invoices, allocate numbers, or call AADE/myDATA.

### Rounding boundary

- Money remains bigint / 4dp; NET↔GROSS uses truncation toward zero via integer ratios.
- Greek/provider HALF_UP minor-unit policy is **not** locked in F2 — finalize at F3 fiscal-document / certified-provider layer.

### Climate fee season (F2 scope)

- Season month is taken from stay check-in date for rule selection.
- Night-by-night season splits across Apr/Nov boundaries remain an F3 refinement if required.

## Sources consulted for Greek seeds

- AADE Basic VAT rates (24% / 13% / 6%; tourist accommodation 13%).
- AADE E.2113/2025 (island 30% VAT reduction architecture).
- Law 5177/2025 Art. 44 + AADE Climate Resilience Fee statement form (2025 rates; Apr–Oct high / Nov–Mar low).

## Consequences

F3 must generate the separate climate-fee legal document from Folio levy snapshots without redesigning Billing.
