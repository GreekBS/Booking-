# ADR-025: Tax Engine, Statutory Rules, and Fiscal Profiles (F2 / F2.1)

## Status

Accepted (F2). Hardened in F2.1. Extends [ADR-024](./024-fiscal-billing-invariants.md).

## Context

F1 established Folio as settlement truth with append-only lines. F2 adds tax calculation and fiscal identity without fiscal documents, myDATA, or provider calls. F2.1 closes two correctness gaps: climate fee night-by-night seasonal evaluation, and verified derivation of Greek reduced-island VAT jurisdiction.

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

### Climate Resilience Fee evaluates per daily use (F2.1)

- Climate levy is evaluated **per daily use** (stay night × room), not as one season for the whole reservation.
- Seasonal boundary (April–October high / November–March low) is resolved **per stay date**.
- A stay crossing March/April or October/November splits correctly across the applicable TaxRules.
- TaxRule `validFrom` / `validUntil` transitions mid-stay are also resolved per daily use.
- Each daily use preserves provenance (`date`, `roomIndex`, `ruleId`, amounts, season month) sufficient for Special Element / receipt generation, reconciliation, reporting, and roll-ups:
  `totalDailyUses`, `complimentaryDailyUses`, `taxableDailyUses`.
- Complimentary daily uses keep use counts with levy amount **0**.
- Snapshot metadata includes `requiresSeparateFiscalDocument: true` and hint
  `climate_resilience_fee_special_element` for F3.

### Greek reduced VAT jurisdiction is derived, not freely selected (F2.1)

- Operators configure **establishment / property location** (`establishmentLocationId`) plus statutory service conditions (`establishmentInEligibleArea`, `servicePhysicallyExecutedInEligibleArea`).
- `GreekFiscalJurisdictionResolver` + versioned statutory catalog derive `GR` or `GR-ISLAND-REDUCED`.
- `GR-ISLAND-REDUCED` is **not** a free UI/API shortcut; direct assignment is rejected.
- Statutory geographic eligibility comes from authoritative AADE/legal catalog data (E.2113/2025 annex; continuing Art. 26 §4 islands from A.1150/2021; 2026 expansion), with legal source/version/effective dates.
- Future legal changes → new effective-dated catalog entries (never rewrite historical resolution).
- **TaxEngine remains geography-agnostic** — it only consumes a resolved jurisdiction code and TaxRules. No island-name conditionals in TaxEngine.
- Ambiguous / insufficient / conflicting eligibility **fails closed**. Never silently apply reduced VAT.

### Fail-closed resolution

- Missing required rule → `ValidationError`.
- Ambiguous equal-priority TaxRule matches → `ConflictError`.
- Missing hotel star / classification for climate fee → fail closed.
- Missing location, ineligible-date location, conflicting catalog rows, or unmet island service conditions → fail closed at jurisdiction resolution.

### Climate Resilience Fee ≠ VAT

- Distinct `taxType: climate_resilience_fee`.
- Climate fee rates are national (jurisdiction wildcard) — independent of island VAT jurisdiction.

### Fiscal profile ≠ Guest

- `CustomerBillingProfile` is separate from Booking guest.
- INDIVIDUAL profiles are not forced to have AFM; BUSINESS (GR) requires AFM format.

### Tax calculation ≠ fiscalization

- Evaluating/posting Folio taxes does **not** issue invoices, allocate numbers, or call AADE/myDATA.

### Rounding boundary

- Money remains bigint / 4dp; NET↔GROSS uses truncation toward zero via integer ratios.
- Greek/provider HALF_UP minor-unit policy is **not** locked in F2 — finalize at F3 fiscal-document / certified-provider layer.

## Sources consulted for Greek seeds

- AADE Basic VAT rates (24% / 13% / 6%; tourist accommodation 13%).
- AADE E.2113/2025 annex (eligible islands/islets; 2026 expansion; continuing Lesvos/Kos/Samos/Chios).
- VAT Code Art. 26 (Law 5144/2024) as amended by Law 5246/2025; AADE A.1150/2021.
- Law 5177/2025 Art. 44 + AADE Climate Resilience Fee statement form (2025 rates; Apr–Oct high / Nov–Mar low).

## Consequences

F3 must generate the separate climate-fee legal document from Folio levy daily-use snapshots without redesigning Billing. Jurisdiction resolution remains outside TaxEngine.
