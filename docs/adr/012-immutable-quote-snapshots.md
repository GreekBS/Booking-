# ADR-012: Immutable Quote Snapshots

## Status
Accepted

## Context
Commercial terms shown to guests and used for booking confirmation must not change after quote creation. Repricing requires a new quote.

## Decision
- `Quote` aggregate is **append-only** after creation — no update or repricing methods
- `QuoteSnapshot` value object stores frozen:
  - nightly line items, subtotal, fees, taxes, total, currency
  - check-in/out dates, property timezone, `quotedAt`, snapshot version
- `Booking` references `quoteSnapshotId`; never mutates snapshot data
- New pricing → new `Quote` row with new `snapshotId`
- `QuoteCreated` event emitted once at creation

## Consequences
- Audit trail preserves exact priced terms at booking time
- Payment amounts derived from snapshot total (Phase 2.5+)
- Domain tests assert snapshot deep immutability and no mutation API on `Quote`
