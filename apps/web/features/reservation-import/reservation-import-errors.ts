import { AdminApiError } from "@/lib/admin/api";
import type { ReservationImportConflictBookingDto } from "@/lib/admin/reservation-import-api";
import { parseConflictSnapshot } from "@hcp/domain";
import type { ReservationImportRowDto } from "@/lib/admin/reservation-import-api";
import {
  RESERVATION_IMPORT_COMMIT_ERROR,
  RESERVATION_IMPORT_COMMIT_NOT_READY_ERROR,
  RESERVATION_IMPORT_COMMIT_REPLACE_NOT_SUPERSEDEABLE,
  RESERVATION_IMPORT_COMMIT_REPLACE_STALE,
  RESERVATION_IMPORT_COMMIT_STALE_ERROR,
  RESERVATION_IMPORT_ROW_REPLACE_ALREADY_SUPERSEDED,
  RESERVATION_IMPORT_ROW_REPLACE_NOT_FOUND,
  RESERVATION_IMPORT_ROW_REPLACE_NOT_SUPERSEDEABLE,
} from "./reservation-import-copy";

const REPLACE_ISSUE_CODES = new Set([
  "REPLACE_TARGETS_STALE",
  "REPLACE_TARGET_NOT_FOUND",
  "REPLACE_TARGET_TENANT_MISMATCH",
  "REPLACE_TARGET_UNIT_MISMATCH",
  "REPLACE_TARGET_NOT_SUPERSEDEABLE",
  "REPLACE_TARGET_ALREADY_SUPERSEDED",
]);

export function bookingStatusLabelEl(status: string): string {
  switch (status) {
    case "pending":
      return "εκκρεμής";
    case "payment_pending":
      return "αναμονή πληρωμής";
    case "confirmed":
      return "επιβεβαιωμένη";
    case "cancelled":
      return "ακυρωμένη";
    case "completed":
      return "ολοκληρωμένη";
    default:
      return status;
  }
}

/** Prefer stable errorCode → Greek; never surface raw stacks or PII. */
export function importRowOperatorErrorMessage(row: ReservationImportRowDto): string | null {
  const code = row.errorCode ?? "";
  if (code === "REPLACE_TARGET_NOT_SUPERSEDEABLE") {
    const status =
      row.errorMessage?.includes(":") === true
        ? row.errorMessage.split(":").slice(1).join(":")
        : "unknown";
    return RESERVATION_IMPORT_ROW_REPLACE_NOT_SUPERSEDEABLE(bookingStatusLabelEl(status));
  }
  if (code === "REPLACE_TARGET_ALREADY_SUPERSEDED") {
    return RESERVATION_IMPORT_ROW_REPLACE_ALREADY_SUPERSEDED;
  }
  if (
    code === "REPLACE_TARGET_NOT_FOUND" ||
    code === "REPLACE_TARGET_TENANT_MISMATCH" ||
    code === "REPLACE_TARGET_UNIT_MISMATCH" ||
    code === "REPLACE_TARGETS_STALE"
  ) {
    return RESERVATION_IMPORT_ROW_REPLACE_NOT_FOUND;
  }
  if (!row.errorCode && !row.errorMessage) return null;
  // Hard blockers / price: keep existing short messages without dumping internals.
  if (row.errorCode?.startsWith("BLOCKED_BY_")) {
    return row.errorMessage ?? row.errorCode;
  }
  if (row.errorCode === "TALOS_PRICE_UNAVAILABLE") {
    return "Το TALOS δεν μπόρεσε να υπολογίσει τιμή για αυτή τη διαμονή.";
  }
  if (row.errorCode === "KEEP_EXISTING" || row.errorCode === "ALREADY_IMPORTED") {
    return null;
  }
  // Avoid showing English machine dumps; fall back to code when unknown.
  if (row.errorCode && REPLACE_ISSUE_CODES.has(row.errorCode)) {
    return RESERVATION_IMPORT_ROW_REPLACE_NOT_FOUND;
  }
  return row.errorCode ? `Εκκρεμότητα: ${row.errorCode}` : null;
}

export function conflictBookingIsSupersedeable(
  booking: ReservationImportConflictBookingDto,
): boolean {
  return booking.status === "completed" && !booking.isSuperseded;
}

export function rowHasNonSupersedeableKeepCsvTarget(
  row: ReservationImportRowDto,
  conflictBookings: ReservationImportConflictBookingDto[],
): boolean {
  if (row.errorCode && REPLACE_ISSUE_CODES.has(row.errorCode) && row.errorCode !== "REPLACE_TARGETS_STALE") {
    return true;
  }
  const snap = parseConflictSnapshot(row.conflictSnapshot);
  if (snap.existingBookingIds.length === 0) return false;
  const byId = new Map(conflictBookings.map((b) => [b.id, b]));
  return snap.existingBookingIds.some((id) => {
    const b = byId.get(id);
    if (!b) return true;
    return !conflictBookingIsSupersedeable(b);
  });
}

export function countNonSupersedeableConflictRows(
  rows: ReservationImportRowDto[],
  conflictBookings: ReservationImportConflictBookingDto[],
): number {
  return rows.filter(
    (r) =>
      (r.conflictResolution === "keep_csv" || r.conflictResolution === "undecided") &&
      rowHasNonSupersedeableKeepCsvTarget(r, conflictBookings),
  ).length;
}

function conflictTypeFromError(error: AdminApiError): string | null {
  const raw = error.details?.conflictType;
  return typeof raw === "string" ? raw : null;
}

/** Map commit AdminApiError → operator-facing Greek (no PII / stacks). */
export function mapCommitFailureToOperatorMessage(error: unknown): {
  kind: "stale" | "not_ready" | "replace_blocked" | "generic";
  message: string;
} {
  if (!(error instanceof AdminApiError)) {
    return { kind: "generic", message: RESERVATION_IMPORT_COMMIT_ERROR };
  }
  const conflictType = conflictTypeFromError(error);
  if (conflictType === "REPLACE_TARGET_NOT_SUPERSEDEABLE") {
    return {
      kind: "replace_blocked",
      message: RESERVATION_IMPORT_COMMIT_REPLACE_NOT_SUPERSEDEABLE,
    };
  }
  if (
    conflictType === "REPLACE_TARGETS_STALE" ||
    conflictType === "REPLACE_TARGET_NOT_FOUND" ||
    conflictType === "REPLACE_TARGET_ALREADY_SUPERSEDED"
  ) {
    return { kind: "stale", message: RESERVATION_IMPORT_COMMIT_REPLACE_STALE };
  }
  if (error.status === 409 || error.code === "CONFLICT") {
    const msg = error.message.toLowerCase();
    if (msg.includes("not supersedeable")) {
      return {
        kind: "replace_blocked",
        message: RESERVATION_IMPORT_COMMIT_REPLACE_NOT_SUPERSEDEABLE,
      };
    }
    return { kind: "stale", message: RESERVATION_IMPORT_COMMIT_STALE_ERROR };
  }
  if (error.status === 400) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("commit blocked") ||
      msg.includes("pending") ||
      msg.includes("unresolved") ||
      msg.includes("recheck") ||
      msg.includes("must be positive") ||
      msg.includes("price is missing")
    ) {
      return { kind: "not_ready", message: RESERVATION_IMPORT_COMMIT_NOT_READY_ERROR };
    }
  }
  return { kind: "generic", message: RESERVATION_IMPORT_COMMIT_ERROR };
}
