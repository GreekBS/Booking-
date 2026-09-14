# ADR-014: Dates, Timezones, and Stay Periods

## Status
Accepted

## Context
Stay nights are sold in property-local calendar dates, while system events and hold expiry use UTC instants.

## Decision
- **Stay dates** are property-local `DATE` values modeled as `LocalDate` (`YYYY-MM-DD`)
- **StayPeriod** uses checkout-exclusive semantics: nights = `[checkIn, checkOut)`
- **Timestamps** (`createdAt`, `expiresAt`, `quotedAt`, domain events) stored as UTC `Date`
- Property `timezone` (IANA, from catalog) provides context for interpreting local dates
- `ITimezoneService` port converts between UTC instants and property-local dates (infrastructure)
- Domain never embeds `Intl` or Node timezone APIs; conversion stays behind the port

## Consequences
- Calendar blocks and EXCLUDE ranges use property-local dateranges
- Admin calendar displays dates in property timezone
- `AvailabilityEvaluator` receives `propertyLocalToday` as explicit input
