import type { ImportStayTemporalClass } from "./ImportStayTemporalClass";

/** V1 CSV operator import namespace — extensible for future sources. */
export const CSV_RESERVATION_IMPORT_NAMESPACE = "csv_reservation_import";

/**
 * Canonical reservation-import draft lifetime.
 * Exactly 72 hours (3 days) from server `createdAt`.
 * Logical expiry is independent of worker physical cleanup.
 */
export const RESERVATION_IMPORT_DRAFT_TTL_HOURS = 72;
export const RESERVATION_IMPORT_DRAFT_TTL_MS =
  RESERVATION_IMPORT_DRAFT_TTL_HOURS * 60 * 60 * 1000;

export type ReservationImportBatchStatus =
  | "draft"
  | "processing"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "expired"
  | "cancelled";

export type ReservationImportMissingPriceStrategy =
  | "undecided"
  | "talos_for_all_missing"
  | "per_row";

export type ReservationImportRowStatus =
  | "pending"
  | "ready"
  | "imported"
  | "replaced"
  | "skipped"
  | "skipped_already_imported"
  | "failed"
  | "discarded";

export type ReservationImportPriceSource =
  | "unresolved"
  | "imported_csv"
  | "talos_calculated"
  | "operator_entered";

export type ReservationImportConflictResolution =
  | "undecided"
  | "keep_existing"
  | "keep_csv";

/** Row statuses that establish durable external_reference ownership. */
export const DURABLE_IMPORT_ROW_STATUSES: readonly ReservationImportRowStatus[] = [
  "imported",
  "replaced",
  "skipped_already_imported",
] as const;

export function isDurableImportRowStatus(
  status: ReservationImportRowStatus,
): boolean {
  return (DURABLE_IMPORT_ROW_STATUSES as readonly string[]).includes(status);
}

export function isResumableImportBatchStatus(
  status: ReservationImportBatchStatus,
): boolean {
  return status === "draft";
}

export interface ReservationImportBatchRecord {
  id: string;
  tenantId: string;
  actorId: string;
  sourceNamespace: string;
  filename: string;
  byteSize: number | null;
  rowCount: number;
  status: ReservationImportBatchStatus;
  missingPriceStrategy: ReservationImportMissingPriceStrategy;
  expiresAt: Date;
  committedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReservationImportRowRecord {
  id: string;
  tenantId: string;
  batchId: string;
  rowNumber: number;
  sourceNamespace: string;
  externalReference: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  temporalClass: ImportStayTemporalClass;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  guestCount: number;
  priceSource: ReservationImportPriceSource;
  importedTotalAmount: string | null;
  importedCurrency: string | null;
  operatorTotalAmount: string | null;
  operatorCurrency: string | null;
  conflictResolution: ReservationImportConflictResolution;
  /** Legacy single replace target (1:1). Prefer replaceBookingIds for multi-overlap. */
  replaceBookingId: string | null;
  /** Bookings to supersede when conflictResolution is keep_csv (may be multiple). */
  replaceBookingIds: string[];
  /** Observed conflicting booking / same-CSV group snapshot for recheck. */
  conflictSnapshot: Record<string, unknown>;
  conflictGroupId: string | null;
  recheckRequired: boolean;
  status: ReservationImportRowStatus;
  createdBookingId: string | null;
  supersededBookingId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  payload: Record<string, unknown>;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Durable create-time exclusions that never became reservation_import_rows. */
export interface ReservationImportRejectedRowRecord {
  id: string;
  tenantId: string;
  batchId: string;
  rowNumber: number;
  payload: Record<string, unknown>;
  errors: unknown[];
  warnings: unknown[];
  createdAt: Date;
}

export interface CreateReservationImportRejectedRowInput {
  id: string;
  tenantId: string;
  batchId: string;
  rowNumber: number;
  payload?: Record<string, unknown>;
  errors?: unknown[];
  warnings?: unknown[];
}

export interface CreateReservationImportBatchInput {
  id: string;
  tenantId: string;
  actorId: string;
  filename: string;
  byteSize?: number | null;
  rowCount?: number;
  sourceNamespace?: string;
  missingPriceStrategy?: ReservationImportMissingPriceStrategy;
  /** Server clock — used for createdAt/expiresAt when provided. */
  now?: Date;
}

export interface CreateReservationImportRowInput {
  id: string;
  tenantId: string;
  batchId: string;
  rowNumber: number;
  externalReference: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  temporalClass: ImportStayTemporalClass;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  guestCount: number;
  sourceNamespace?: string;
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
  payload?: Record<string, unknown>;
}

export function computeReservationImportDraftExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + RESERVATION_IMPORT_DRAFT_TTL_MS);
}

export function isReservationImportDraftExpired(
  batch: Pick<ReservationImportBatchRecord, "status" | "expiresAt">,
  now: Date = new Date(),
): boolean {
  if (batch.status !== "draft") {
    return false;
  }
  return now.getTime() >= batch.expiresAt.getTime();
}

export function canResumeReservationImportDraft(
  batch: Pick<ReservationImportBatchRecord, "status" | "expiresAt">,
  now: Date = new Date(),
): boolean {
  return isResumableImportBatchStatus(batch.status) && !isReservationImportDraftExpired(batch, now);
}
