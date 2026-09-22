import type {
  BookingComAriResolvedProjection,
  IBookingComAriPushLedger,
  BookingComAriPushLedgerOutcome,
  BookingComAriPushLedgerRecord,
} from "@hcp/domain";
import { Prisma } from "@prisma/client";
import { prisma } from "../../client";

function mapRow(record: {
  tenantId: string;
  connectionId: string;
  coalesceKey: string;
  highestGeneration: bigint;
  lastSucceededGeneration: bigint | null;
  pendingPayload: unknown;
  lastRuid: string | null;
  lastOutcome: string | null;
  lastError: string | null;
  updatedAt: Date;
}): BookingComAriPushLedgerRecord {
  return {
    tenantId: record.tenantId,
    connectionId: record.connectionId,
    coalesceKey: record.coalesceKey,
    highestGeneration: Number(record.highestGeneration),
    lastSucceededGeneration:
      record.lastSucceededGeneration == null
        ? null
        : Number(record.lastSucceededGeneration),
    pendingProjection: (record.pendingPayload as BookingComAriResolvedProjection | null) ?? null,
    lastRuid: record.lastRuid,
    lastOutcome: (record.lastOutcome as BookingComAriPushLedgerOutcome | null) ?? null,
    lastError: record.lastError,
    updatedAt: record.updatedAt,
  };
}

export class PrismaChannelAriPushLedger implements IBookingComAriPushLedger {
  async upsertPending(input: {
    coalesceKey: string;
    projection: BookingComAriResolvedProjection;
  }): Promise<BookingComAriPushLedgerRecord> {
    const existing = await prisma.channelAriPushLedger.findUnique({
      where: {
        tenantId_connectionId_coalesceKey: {
          tenantId: input.projection.tenantId,
          connectionId: input.projection.connectionId,
          coalesceKey: input.coalesceKey,
        },
      },
    });

    if (existing && input.projection.generation < Number(existing.highestGeneration)) {
      return mapRow(existing);
    }

    const record = await prisma.channelAriPushLedger.upsert({
      where: {
        tenantId_connectionId_coalesceKey: {
          tenantId: input.projection.tenantId,
          connectionId: input.projection.connectionId,
          coalesceKey: input.coalesceKey,
        },
      },
      create: {
        tenantId: input.projection.tenantId,
        connectionId: input.projection.connectionId,
        coalesceKey: input.coalesceKey,
        highestGeneration: BigInt(input.projection.generation),
        pendingPayload: input.projection as unknown as Prisma.InputJsonValue,
        lastOutcome: "pending",
      },
      update: {
        highestGeneration: BigInt(input.projection.generation),
        pendingPayload: input.projection as unknown as Prisma.InputJsonValue,
        lastOutcome: "pending",
        lastError: null,
      },
    });
    return mapRow(record);
  }

  async get(input: {
    tenantId: string;
    connectionId: string;
    coalesceKey: string;
  }): Promise<BookingComAriPushLedgerRecord | null> {
    const record = await prisma.channelAriPushLedger.findUnique({
      where: {
        tenantId_connectionId_coalesceKey: {
          tenantId: input.tenantId,
          connectionId: input.connectionId,
          coalesceKey: input.coalesceKey,
        },
      },
    });
    return record ? mapRow(record) : null;
  }

  async markSucceeded(input: {
    tenantId: string;
    connectionId: string;
    coalesceKey: string;
    generation: number;
    ruid: string | null;
  }): Promise<void> {
    const existing = await this.get(input);
    const nextSucceeded = Math.max(
      existing?.lastSucceededGeneration ?? 0,
      input.generation,
    );
    const clearPending =
      !!existing?.pendingProjection &&
      existing.pendingProjection.generation <= input.generation;

    await prisma.channelAriPushLedger.update({
      where: {
        tenantId_connectionId_coalesceKey: {
          tenantId: input.tenantId,
          connectionId: input.connectionId,
          coalesceKey: input.coalesceKey,
        },
      },
      data: {
        lastSucceededGeneration: BigInt(nextSucceeded),
        ...(clearPending ? { pendingPayload: Prisma.JsonNull } : {}),
        lastRuid: input.ruid,
        lastOutcome: "succeeded",
        lastError: null,
      },
    });
  }

  async markOutcome(input: {
    tenantId: string;
    connectionId: string;
    coalesceKey: string;
    outcome: BookingComAriPushLedgerOutcome;
    error?: string | null;
    ruid?: string | null;
  }): Promise<void> {
    await prisma.channelAriPushLedger.update({
      where: {
        tenantId_connectionId_coalesceKey: {
          tenantId: input.tenantId,
          connectionId: input.connectionId,
          coalesceKey: input.coalesceKey,
        },
      },
      data: {
        lastOutcome: input.outcome,
        lastError: input.error ?? null,
        ...(input.ruid !== undefined ? { lastRuid: input.ruid } : {}),
      },
    });
  }
}
