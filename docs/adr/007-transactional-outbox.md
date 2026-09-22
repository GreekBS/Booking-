# ADR-007: Transactional Outbox Pattern

## Status
Accepted

## Context
Domain events must be persisted reliably alongside aggregate writes for future async processing (Phase 2+ consumers) without dual-write inconsistencies.

## Decision
Use the transactional outbox pattern:
- Aggregates emit domain events via `AggregateRoot.addDomainEvent`
- `IOutboxRepository.saveEvents` writes to `outbox_events` in the same Prisma transaction as aggregate persistence
- `PrismaOutboxRepository` is injected into repositories; `saveAggregateWithOutbox` helper coordinates transaction boundaries
- Events include `tenantId`, `aggregateType`, `aggregateId`, `eventType`, and JSON `payload`

## Consequences
- No inline outbox writes in repositories (except shared persistence helpers that still use `IOutboxRepository` / transactional commit stores)
- Outbox processor: always-on worker (`apps/worker`) drains via `ProcessOutboxBatchUseCase` after LISTEN/NOTIFY wake or recovery sweep; ops HTTP `POST /api/internal/v1/outbox/dispatch` remains
- Repository saves always pull events before transaction commit
- Durable outbox insert + transactional `NOTIFY` (best-effort); lost wake recovered by worker sweep (~1–3s)
- Cron is not the primary outbox execution engine — see `docs/talos-event-driven-async-worker.md`
