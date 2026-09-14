# ADR-013: Money and Decimal Rules

## Status
Accepted

## Context
Floating-point arithmetic causes rounding errors unacceptable for hospitality pricing and payments.

## Decision
- Domain `Money` value object wraps `{ amount: string, currency: ISO4217 }`
- Amounts normalized to **4 decimal places** (matches `NUMERIC(19,4)` in Phase 2B)
- All arithmetic uses scaled `bigint` internally — **no IEEE float**
- Percent calculations truncate toward zero at 4 decimal places
- Invalid amounts and non-3-letter currency codes rejected at construction
- Cross-currency operations forbidden at domain layer

## Consequences
- Prisma `Decimal` maps to/from domain string amounts in repositories (Phase 2B)
- Pricing engine and quote snapshots use `Money` / normalized strings exclusively
- Tests cover addition, subtraction, percent, and rounding edge cases
