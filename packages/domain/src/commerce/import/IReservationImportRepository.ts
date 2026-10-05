import type {
  CreateReservationImportBatchInput,
  CreateReservationImportRejectedRowInput,
  CreateReservationImportRowInput,
  ReservationImportBatchRecord,
  ReservationImportMissingPriceStrategy,
  ReservationImportRejectedRowRecord,
  ReservationImportRowRecord,
  ReservationImportRowStatus,
  ReservationImportConflictResolution,
  ReservationImportPriceSource,
} from "./ReservationImportTypes";

export interface UpdateReservationImportBatchInput {
  missingPriceStrategy?: ReservationImportMissingPriceStrategy;
  rowCount?: number;
  status?: ReservationImportBatchRecord["status"];
  committedAt?: Date | null;
}

export interface UpdateReservationImportRowInput {
  priceSource?: ReservationImportPriceSource;
  importedTotalAmount?: string | null;
  importedCurrency?: string | null;
  operatorTotalAmount?: string | null;
  operatorCurrency?: string | null;
  conflictResolution?: ReservationImportConflictResolution;
  replaceBookingId?: string | null;
  replaceBookingIds?: string[];
  conflictSnapshot?: Record<string, unknown>;
  conflictGroupId?: string | null;
  recheckRequired?: boolean;
  status?: ReservationImportRowStatus;
  createdBookingId?: string | null;
  supersededBookingId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  payload?: Record<string, unknown>;
  processedAt?: Date | null;
}

export interface DurableImportIdentityLookup {
  tenantId: string;
  sourceNamespace: string;
  externalReference: string;
}

/**
 * Persistence port for CSV reservation import batches/rows.
 * All methods are tenant-scoped; callers must use authenticated tenant context.
 */
export interface IReservationImportRepository {
  createBatch(input: CreateReservationImportBatchInput): Promise<ReservationImportBatchRecord>;

  findBatchById(
    batchId: string,
    tenantId: string,
  ): Promise<ReservationImportBatchRecord | null>;

  /** Active resumable drafts only (status=draft and expiresAt > now). */
  listResumableDrafts(
    tenantId: string,
    now?: Date,
  ): Promise<ReservationImportBatchRecord[]>;

  updateBatch(
    batchId: string,
    tenantId: string,
    patch: UpdateReservationImportBatchInput,
    now?: Date,
  ): Promise<ReservationImportBatchRecord>;

  /**
   * Cancel unfinished draft. Never deletes Bookings / durable rows.
   * Idempotent when already cancelled/expired.
   */
  cancelDraft(batchId: string, tenantId: string, now?: Date): Promise<ReservationImportBatchRecord>;

  createRows(inputs: CreateReservationImportRowInput[]): Promise<ReservationImportRowRecord[]>;

  listRowsForBatch(
    batchId: string,
    tenantId: string,
  ): Promise<ReservationImportRowRecord[]>;

  updateRow(
    rowId: string,
    tenantId: string,
    patch: UpdateReservationImportRowInput,
    now?: Date,
  ): Promise<ReservationImportRowRecord>;

  findDurableByExternalReference(
    lookup: DurableImportIdentityLookup,
  ): Promise<ReservationImportRowRecord | null>;

  createRejectedRows(
    inputs: CreateReservationImportRejectedRowInput[],
  ): Promise<ReservationImportRejectedRowRecord[]>;

  listRejectedRowsForBatch(
    batchId: string,
    tenantId: string,
  ): Promise<ReservationImportRejectedRowRecord[]>;

  /**
   * Atomically apply keep_csv / keep_existing for a unit: lock rows, demote
   * overlapping keep_csv peers, return all batch rows after updates.
   */
  applyConflictDecisionAtomic(input: {
    tenantId: string;
    batchId: string;
    rowId: string;
    conflictResolution: ReservationImportConflictResolution;
    replaceBookingIds: string[];
    replaceBookingId: string | null;
    priceSource?: ReservationImportPriceSource;
    operatorTotalAmount?: string | null;
    operatorCurrency?: string | null;
    now?: Date;
  }): Promise<ReservationImportRowRecord[]>;

  /**
   * Mark expired drafts and remove disposable workflow rows.
   * Preserves durable terminal rows / bookings. Idempotent.
   */
  expireDrafts(now?: Date, limit?: number): Promise<{ expiredBatches: number; discardedRows: number }>;
}
