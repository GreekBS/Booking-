# ADR-009: Unit Calendar Block Model

## Status
Accepted

## Context
Inventory must represent manual operator blocks, hold locks, confirmed bookings, and turnover buffers without maintaining multiple overlapping tables.

## Decision
Use a single `unit_calendar_blocks` table (Phase 2B) with typed blocks:

| block_type | source_id | Created by |
|------------|-----------|------------|
| `manual` | null | Operator / inventory use case |
| `hold` | hold_id | Hold creation transaction |
| `booking` | booking_id | Booking confirmation transaction |
| `turnover` | booking_id | Optional post-checkout buffer |

Each row includes:
- `stay_period DATERANGE` — property-local dates `[checkIn, checkOut)` (checkout exclusive)
- `status` — `active | released | expired | cancelled`
- `expires_at` — for hold blocks only

Manual blocks are operator-owned; system blocks are created by hold/booking workflows via `ICalendarBlockRepository` in the same transaction as the aggregate write.

## Consequences
- `AvailabilityEvaluator` consumes `ActiveCalendarBlock` read models, not raw SQL.
- Manual blocks can be updated/deleted; hold/booking blocks are lifecycle-managed by aggregates.
- Calendar read API merges all block types for admin UI.
