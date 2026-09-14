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
- No inline outbox writes in repositories
- Outbox processor (Phase 2) can poll `findUnprocessed` / `markProcessed`
- Repository saves always pull events before transaction commit
