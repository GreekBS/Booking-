import type {
  CsvImportCanonicalField,
  CsvImportDateFormat,
  CsvImportDelimiter,
  CsvImportIssue,
} from "@hcp/domain";
import { AdminApiError, adminFetch } from "@/lib/admin/api";

/** Batch DTO from B2 reservation-import serializers. */
export interface ReservationImportBatchDto {
  id: string;
  tenantId: string;
  actorId: string;
  sourceNamespace: string;
  filename: string;
  byteSize: number | null;
  rowCount: number;
  status: string;
  missingPriceStrategy: string;
  expiresAt: string;
  committedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Row DTO (loaded with get; unused fields kept for later B3 phases). */
export interface ReservationImportRowDto {
  id: string;
  tenantId: string;
  batchId: string;
  rowNumber: number;
  sourceNamespace: string;
  externalReference: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  temporalClass: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  guestCount: number;
  priceSource: string;
  importedTotalAmount: string | null;
  importedCurrency: string | null;
  operatorTotalAmount: string | null;
  operatorCurrency: string | null;
  conflictResolution: string;
  replaceBookingId: string | null;
  replaceBookingIds: string[];
  conflictSnapshot: Record<string, unknown>;
  conflictGroupId: string | null;
  recheckRequired: boolean;
  status: string;
  createdBookingId: string | null;
  supersededBookingId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  payload: Record<string, unknown>;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationImportRejectedRowDto {
  id: string;
  tenantId: string;
  batchId: string;
  rowNumber: number;
  payload: Record<string, unknown>;
  errors: unknown[];
  warnings: unknown[];
  createdAt: string;
}

export interface ReservationImportDraftDetail {
  batch: ReservationImportBatchDto;
  rows: ReservationImportRowDto[];
  rejectedRows: ReservationImportRejectedRowDto[];
}

export function isReservationImportExpiredError(error: unknown): boolean {
  if (!(error instanceof AdminApiError)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("expired") || msg.includes("λήξει");
}

export function isReservationImportNotFoundError(error: unknown): boolean {
  if (!(error instanceof AdminApiError)) return false;
  if (error.status === 404) return true;
  const msg = error.message.toLowerCase();
  return msg.includes("not found") || msg.includes("δεν βρέθηκε");
}

export async function listReservationImportDrafts(
  tenantId: string,
): Promise<ReservationImportBatchDto[]> {
  const payload = await adminFetch<{ data: ReservationImportBatchDto[] }>(
    "/reservation-imports",
    { tenantId },
  );
  return payload.data ?? [];
}

export async function getReservationImportDraft(
  tenantId: string,
  batchId: string,
): Promise<ReservationImportDraftDetail> {
  return adminFetch<ReservationImportDraftDetail>(
    `/reservation-imports/${encodeURIComponent(batchId)}`,
    { tenantId },
  );
}

export async function discardReservationImportDraft(
  tenantId: string,
  batchId: string,
): Promise<ReservationImportBatchDto> {
  const payload = await adminFetch<{ batch: ReservationImportBatchDto }>(
    `/reservation-imports/${encodeURIComponent(batchId)}/discard`,
    { method: "POST", tenantId, body: "{}" },
  );
  return payload.batch;
}

export interface CreateReservationImportDraftResponse {
  batch: ReservationImportBatchDto;
  rows: ReservationImportRowDto[];
  rejectedRows: ReservationImportRejectedRowDto[];
  parseIssues: CsvImportIssue[];
}

export interface CreateReservationImportDraftInput {
  file: File;
  columnMapping?: Record<string, CsvImportCanonicalField | null>;
  dateFormat?: CsvImportDateFormat;
  delimiter?: CsvImportDelimiter;
}

/**
 * Multipart create — body is FormData; adminFetch must not force JSON Content-Type.
 */
export async function createReservationImportDraft(
  tenantId: string,
  input: CreateReservationImportDraftInput,
): Promise<CreateReservationImportDraftResponse> {
  const form = new FormData();
  form.append("file", input.file, input.file.name || "import.csv");
  if (input.delimiter !== undefined) {
    form.append("delimiter", input.delimiter);
  }
  if (input.dateFormat !== undefined) {
    form.append("dateFormat", input.dateFormat);
  }
  if (input.columnMapping !== undefined) {
    form.append("columnMapping", JSON.stringify(input.columnMapping));
  }
  return adminFetch<CreateReservationImportDraftResponse>("/reservation-imports", {
    method: "POST",
    tenantId,
    body: form,
  });
}
