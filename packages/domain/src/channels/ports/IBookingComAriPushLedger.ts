import type { BookingComAriResolvedProjection } from "../providers/booking_com/ari/BookingComAriProjection";

export type BookingComAriPushLedgerOutcome =
  | "pending"
  | "succeeded"
  | "partial"
  | "failed"
  | "stale_suppressed";

export interface BookingComAriPushLedgerRecord {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly coalesceKey: string;
  readonly highestGeneration: number;
  readonly lastSucceededGeneration: number | null;
  readonly pendingProjection: BookingComAriResolvedProjection | null;
  readonly lastRuid: string | null;
  readonly lastOutcome: BookingComAriPushLedgerOutcome | null;
  readonly lastError: string | null;
  readonly updatedAt: Date;
}

export interface IBookingComAriPushLedger {
  upsertPending(input: {
    coalesceKey: string;
    projection: BookingComAriResolvedProjection;
  }): Promise<BookingComAriPushLedgerRecord>;

  get(input: {
    tenantId: string;
    connectionId: string;
    coalesceKey: string;
  }): Promise<BookingComAriPushLedgerRecord | null>;

  markSucceeded(input: {
    tenantId: string;
    connectionId: string;
    coalesceKey: string;
    generation: number;
    ruid: string | null;
  }): Promise<void>;

  markOutcome(input: {
    tenantId: string;
    connectionId: string;
    coalesceKey: string;
    outcome: BookingComAriPushLedgerOutcome;
    error?: string | null;
    ruid?: string | null;
  }): Promise<void>;
}
