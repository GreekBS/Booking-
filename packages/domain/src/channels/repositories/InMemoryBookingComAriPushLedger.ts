import type { BookingComAriResolvedProjection } from "../providers/booking_com/ari/BookingComAriProjection";
import type {
  BookingComAriPushLedgerOutcome,
  BookingComAriPushLedgerRecord,
  IBookingComAriPushLedger,
} from "../ports/IBookingComAriPushLedger";

function keyOf(tenantId: string, connectionId: string, coalesceKey: string): string {
  return `${tenantId}\0${connectionId}\0${coalesceKey}`;
}

/**
 * Durable-semantics in-memory ledger for tests / local fakes.
 * Production uses PrismaChannelAriPushLedger (CM-4c-3 migration).
 */
export class InMemoryBookingComAriPushLedger implements IBookingComAriPushLedger {
  private readonly rows = new Map<string, BookingComAriPushLedgerRecord>();

  async upsertPending(input: {
    coalesceKey: string;
    projection: BookingComAriResolvedProjection;
  }): Promise<BookingComAriPushLedgerRecord> {
    const k = keyOf(
      input.projection.tenantId,
      input.projection.connectionId,
      input.coalesceKey,
    );
    const existing = this.rows.get(k);
    if (existing && input.projection.generation < existing.highestGeneration) {
      return existing;
    }
    const next: BookingComAriPushLedgerRecord = {
      tenantId: input.projection.tenantId,
      connectionId: input.projection.connectionId,
      coalesceKey: input.coalesceKey,
      highestGeneration: input.projection.generation,
      lastSucceededGeneration: existing?.lastSucceededGeneration ?? null,
      pendingProjection: input.projection,
      lastRuid: existing?.lastRuid ?? null,
      lastOutcome: "pending",
      lastError: null,
      updatedAt: new Date(),
    };
    this.rows.set(k, next);
    return next;
  }

  async get(input: {
    tenantId: string;
    connectionId: string;
    coalesceKey: string;
  }): Promise<BookingComAriPushLedgerRecord | null> {
    return this.rows.get(keyOf(input.tenantId, input.connectionId, input.coalesceKey)) ?? null;
  }

  async markSucceeded(input: {
    tenantId: string;
    connectionId: string;
    coalesceKey: string;
    generation: number;
    ruid: string | null;
  }): Promise<void> {
    const k = keyOf(input.tenantId, input.connectionId, input.coalesceKey);
    const existing = this.rows.get(k);
    if (!existing) return;
    this.rows.set(k, {
      ...existing,
      lastSucceededGeneration: Math.max(
        existing.lastSucceededGeneration ?? 0,
        input.generation,
      ),
      pendingProjection:
        existing.pendingProjection &&
        existing.pendingProjection.generation <= input.generation
          ? null
          : existing.pendingProjection,
      lastRuid: input.ruid,
      lastOutcome: "succeeded",
      lastError: null,
      updatedAt: new Date(),
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
    const k = keyOf(input.tenantId, input.connectionId, input.coalesceKey);
    const existing = this.rows.get(k);
    if (!existing) return;
    this.rows.set(k, {
      ...existing,
      lastOutcome: input.outcome,
      lastError: input.error ?? null,
      lastRuid: input.ruid ?? existing.lastRuid,
      updatedAt: new Date(),
    });
  }
}
