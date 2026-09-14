# Reservation module

Coordinates reservation write flows via `ReservationOrchestrator`.

Business rules live in aggregates (`Booking`, `Quote`, `Hold`) and pure services (`AvailabilityEvaluator`, `PricingCalculator`).

See `docs/architecture/ADR-020-reservation-orchestrator.md`.
