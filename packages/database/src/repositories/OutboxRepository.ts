import type {
  DomainEvent,
  IOutboxRepository,
  OutboxEntry,
  OutboxEventStatus,
  OutboxFailureDisposition,
} from "@hcp/domain";
import type { Prisma } from "@prisma/client";
import { prisma } from "../client";
import {
  TALOS_ASYNC_WAKE_OUTBOX_CHANNEL,
  notifyTalosAsyncWake,
} from "../async/talosAsyncWake";

export type TransactionClient = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

const STALE_CLAIM_MS = 5 * 60 * 1000;

type ClaimedOutboxRow = {
  id: string;
  tenant_id: string | null;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: unknown;
  status: OutboxEventStatus;
  attempt_count: number;
};

function mapOutboxRow(row: ClaimedOutboxRow): OutboxEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    payload: row.payload as Record<string, unknown>,
    status: row.status,
    attemptCount: row.attempt_count,
  };
}

export class PrismaOutboxRepository implements IOutboxRepository {
  async saveEvents(
    events: DomainEvent[],
    tx?: TransactionClient,
  ): Promise<void> {
    if (events.length === 0) {
      return;
    }

    const data = events.map((event) => ({
      tenantId: event.tenantId,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      eventType: event.eventType,
      payload: event.payload as Prisma.InputJsonValue,
      deliveryKey: event.deliveryKey ?? null,
      status: "pending" as const,
    }));

    if (tx) {
      await tx.outboxEvent.createMany({ data });
      // Same TX as durable write → NOTIFY after commit.
      await notifyTalosAsyncWake(tx, TALOS_ASYNC_WAKE_OUTBOX_CHANNEL);
      return;
    }

    await prisma.$transaction(async (inner) => {
      await inner.outboxEvent.createMany({ data });
      await notifyTalosAsyncWake(inner, TALOS_ASYNC_WAKE_OUTBOX_CHANNEL);
    });
  }

  async findUnprocessed(limit: number): Promise<OutboxEntry[]> {
    const records = await prisma.outboxEvent.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    return records.map((record) => ({
      id: record.id,
      tenantId: record.tenantId,
      aggregateType: record.aggregateType,
      aggregateId: record.aggregateId,
      eventType: record.eventType,
      payload: record.payload as Record<string, unknown>,
      status: record.status as OutboxEventStatus,
      attemptCount: record.attemptCount,
    }));
  }

  async claimBatch(limit: number): Promise<OutboxEntry[]> {
    const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);

    const rows = await prisma.$queryRaw<ClaimedOutboxRow[]>`
      UPDATE "outbox_events"
      SET
        "status" = 'processing'::"OutboxEventStatus",
        "claimed_at" = NOW()
      WHERE "id" IN (
        SELECT "id"
        FROM "outbox_events"
        WHERE
          "status" IN ('pending'::"OutboxEventStatus", 'processing'::"OutboxEventStatus")
          AND (
            "status" = 'pending'::"OutboxEventStatus"
            OR "claimed_at" < ${staleBefore}
          )
        ORDER BY "created_at" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        "id",
        "tenant_id",
        "aggregate_type",
        "aggregate_id",
        "event_type",
        "payload",
        "status",
        "attempt_count"
    `;

    return rows.map(mapOutboxRow);
  }

  async markProcessed(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await prisma.outboxEvent.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "completed",
        processedAt: new Date(),
        claimedAt: null,
      },
    });
  }

  async markCompleted(id: string): Promise<void> {
    await prisma.outboxEvent.update({
      where: { id },
      data: {
        status: "completed",
        processedAt: new Date(),
        claimedAt: null,
      },
    });
  }

  async markFailed(
    id: string,
    error: string,
    maxAttempts: number,
  ): Promise<OutboxFailureDisposition> {
    const record = await prisma.outboxEvent.findUnique({ where: { id } });
    if (!record) {
      throw new Error(`Outbox event not found: ${id}`);
    }

    const attemptCount = record.attemptCount + 1;
    if (attemptCount >= maxAttempts) {
      await prisma.outboxEvent.update({
        where: { id },
        data: {
          status: "dead_letter",
          attemptCount,
          lastError: error,
          claimedAt: null,
        },
      });
      return "dead_letter";
    }

    await prisma.$transaction(async (tx) => {
      await tx.outboxEvent.update({
        where: { id },
        data: {
          status: "pending",
          attemptCount,
          lastError: error,
          claimedAt: null,
        },
      });
      await notifyTalosAsyncWake(tx, TALOS_ASYNC_WAKE_OUTBOX_CHANNEL);
    });
    return "retry";
  }
}

export async function saveAggregateWithOutbox(
  outboxRepository: PrismaOutboxRepository,
  events: DomainEvent[],
  persist: (tx: TransactionClient) => Promise<void>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await persist(tx);
    await outboxRepository.saveEvents(events, tx);
  });
}
