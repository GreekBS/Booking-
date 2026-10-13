import { AdminApiError } from "@/lib/admin/api";
import type { ReservationImportConflictBookingDto } from "@/lib/admin/reservation-import-api";
import { parseConflictSnapshot } from "@hcp/domain";
import type { ReservationImportRowDto } from "@/lib/admin/reservation-import-api";
import {
  RESERVATION_IMPORT_COMMIT_ERROR,
  RESERVATION_IMPORT_COMMIT_NOT_READY_ERROR,
  RESERVATION_IMPORT_COMMIT_UNRESOLVED_CONFLICTS,
  RESERVATION_IMPORT_COMMIT_SHARED_REPLACE_ISSUE,
  RESERVATION_IMPORT_COMMIT_INVALID_AMOUNT,
  RESERVATION_IMPORT_COMMIT_INVALID_CURRENCY,
  RESERVATION_IMPORT_COMMIT_REPLACE_DEPS,
  RESERVATION_IMPORT_COMMIT_REPLACE_NOT_SUPERSEDEABLE,
  RESERVATION_IMPORT_COMMIT_REPLACE_STALE,
  RESERVATION_IMPORT_COMMIT_STALE_ERROR,
  RESERVATION_IMPORT_ROW_REPLACE_ALREADY_SUPERSEDED,
  RESERVATION_IMPORT_ROW_REPLACE_DEPS_CHANNEL,
  RESERVATION_IMPORT_ROW_REPLACE_DEPS_FOLIO,
  RESERVATION_IMPORT_ROW_REPLACE_DEPS_PAYMENTS,
  RESERVATION_IMPORT_ROW_REPLACE_DEPS_UNAVAILABLE,
  RESERVATION_IMPORT_ROW_REPLACE_NOT_FOUND,
  RESERVATION_IMPORT_ROW_REPLACE_NOT_SUPERSEDEABLE,
  RESERVATION_IMPORT_ROW_REPLACE_STALE_ELIGIBILITY,
} from "./reservation-import-copy";

const REPLACE_ISSUE_CODES = new Set([
  "REPLACE_TARGETS_STALE",
  "REPLACE_TARGET_NOT_FOUND",
  "REPLACE_TARGET_TENANT_MISMATCH",
  "REPLACE_TARGET_UNIT_MISMATCH",
  "REPLACE_TARGET_NOT_SUPERSEDEABLE",
  "REPLACE_TARGET_ALREADY_SUPERSEDED",
  "REPLACE_TARGET_HAS_CHANNEL_LINK",
  "REPLACE_TARGET_HAS_PAYMENTS",
  "REPLACE_TARGET_HAS_FOLIO",
  "REPLACE_TARGET_DEPS_UNAVAILABLE",
]);

const REPLACE_DEP_CODES = new Set([
  "REPLACE_TARGET_HAS_CHANNEL_LINK",
  "REPLACE_TARGET_HAS_PAYMENTS",
  "REPLACE_TARGET_HAS_FOLIO",
  "REPLACE_TARGET_DEPS_UNAVAILABLE",
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

const TERMINAL_IMPORT_ROW_STATUSES = new Set([
  "imported",
  "skipped",
  "skipped_already_imported",
]);

/**
 * Prefer stable errorCode → Greek; never surface raw stacks or PII.
 * Terminal (completed-import) rows must not show actionable preflight blockers.
 */
export function importRowOperatorErrorMessage(row: ReservationImportRowDto): string | null {
  if (TERMINAL_IMPORT_ROW_STATUSES.has(row.status)) {
    return null;
  }
  const code = row.errorCode ?? "";
  if (code === "REPLACE_TARGET_NOT_SUPERSEDEABLE") {
    const status =
      row.errorMessage?.includes(":") === true
        ? row.errorMessage.split(":").slice(1).join(":").trim()
        : "unknown";
    // Never claim confirmed/completed are both forbidden and allowed.
    if (status === "confirmed" || status === "completed") {
      return RESERVATION_IMPORT_ROW_REPLACE_STALE_ELIGIBILITY;
    }
    return RESERVATION_IMPORT_ROW_REPLACE_NOT_SUPERSEDEABLE(bookingStatusLabelEl(status));
  }
  if (code === "REPLACE_TARGET_ALREADY_SUPERSEDED") {
    return RESERVATION_IMPORT_ROW_REPLACE_ALREADY_SUPERSEDED;
  }
  if (code === "REPLACE_TARGET_HAS_CHANNEL_LINK") {
    return RESERVATION_IMPORT_ROW_REPLACE_DEPS_CHANNEL;
  }
  if (code === "REPLACE_TARGET_HAS_PAYMENTS") {
    return RESERVATION_IMPORT_ROW_REPLACE_DEPS_PAYMENTS;
  }
  if (code === "REPLACE_TARGET_HAS_FOLIO") {
    return RESERVATION_IMPORT_ROW_REPLACE_DEPS_FOLIO;
  }
  if (code === "REPLACE_TARGET_DEPS_UNAVAILABLE") {
    return RESERVATION_IMPORT_ROW_REPLACE_DEPS_UNAVAILABLE;
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
  if (row.errorCode?.startsWith("BLOCKED_BY_")) {
    return row.errorMessage ?? row.errorCode;
  }
  if (row.errorCode === "TALOS_PRICE_UNAVAILABLE") {
    return "Το TALOS δεν μπόρεσε να υπολογίσει τιμή για αυτή τη διαμονή.";
  }
  if (row.errorCode === "KEEP_EXISTING" || row.errorCode === "ALREADY_IMPORTED") {
    return null;
  }
  if (row.errorCode && REPLACE_ISSUE_CODES.has(row.errorCode)) {
    return RESERVATION_IMPORT_ROW_REPLACE_NOT_FOUND;
  }
  return row.errorCode ? `Εκκρεμότητα: ${row.errorCode}` : null;
}

export function conflictBookingIsSupersedeable(
  booking: ReservationImportConflictBookingDto,
): boolean {
  if (booking.isSuperseded) return false;
  if (booking.status !== "completed" && booking.status !== "confirmed") return false;
  if (booking.depsUnavailable) return false;
  // Folio/payments are archive warnings only; active channel links still block.
  if (booking.hasChannelLink) return false;
  return true;
}

/** True when archival should show a prominent financial/fiscal warning. */
export function conflictBookingHasFinancialArchiveWarning(
  booking: ReservationImportConflictBookingDto,
): boolean {
  return (
    booking.hasPayments ||
    booking.hasPostedFolioLines ||
    booking.hasFiscalDocuments ||
    (booking.hasFolio && !booking.hasPostedFolioLines)
  );
}

export function rowHasNonSupersedeableKeepCsvTarget(
  row: ReservationImportRowDto,
  conflictBookings: ReservationImportConflictBookingDto[],
): boolean {
  if (TERMINAL_IMPORT_ROW_STATUSES.has(row.status)) {
    return false;
  }
  if (
    row.errorCode &&
    REPLACE_ISSUE_CODES.has(row.errorCode) &&
    row.errorCode !== "REPLACE_TARGETS_STALE"
  ) {
    // Stale pre-rule residue: NOT_SUPERSEDEABLE:confirmed|completed must not
    // override live enrichment that now marks the target supersedeable.
    if (!isStaleConfirmedOrCompletedNotSupersedeable(row)) {
      return true;
    }
  }
  const snap = parseConflictSnapshot(row.conflictSnapshot);
  if (snap.existingBookingIds.length === 0) return false;
  const byId = new Map(conflictBookings.map((b) => [b.id, b]));
  return snap.existingBookingIds.some((id) => {
    const b = byId.get(id);
    if (!b) return true;
    // Already-archived targets are not active blockers.
    if (b.isSuperseded) return false;
    return !conflictBookingIsSupersedeable(b);
  });
}

/**
 * Persisted `ready` can be stale vs live conflict enrichment (status/deps).
 * Used so UI readiness / Import gate never overstates eligibility.
 */
function isStaleConfirmedOrCompletedNotSupersedeable(row: ReservationImportRowDto): boolean {
  if (row.errorCode !== "REPLACE_TARGET_NOT_SUPERSEDEABLE") return false;
  const status =
    row.errorMessage?.includes(":") === true
      ? row.errorMessage.split(":").slice(1).join(":").trim()
      : "";
  return status === "confirmed" || status === "completed";
}

export function rowLooksReadyForImport(
  row: ReservationImportRowDto,
  conflictBookings: ReservationImportConflictBookingDto[],
): boolean {
  if (row.status !== "ready") return false;
  if (row.conflictResolution === "keep_csv") {
    if (rowHasNonSupersedeableKeepCsvTarget(row, conflictBookings)) return false;
  }
  if (
    row.errorCode &&
    REPLACE_ISSUE_CODES.has(row.errorCode) &&
    !isStaleConfirmedOrCompletedNotSupersedeable(row)
  ) {
    return false;
  }
  return true;
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
  if (conflictType && REPLACE_DEP_CODES.has(conflictType)) {
    return {
      kind: "replace_blocked",
      message: RESERVATION_IMPORT_COMMIT_REPLACE_DEPS,
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
    if (
      msg.includes("channel reservation link") ||
      msg.includes("payment records") ||
      msg.includes("folio records") ||
      msg.includes("dependencies could not be evaluated")
    ) {
      return {
        kind: "replace_blocked",
        message: RESERVATION_IMPORT_COMMIT_REPLACE_DEPS,
      };
    }
    return { kind: "stale", message: RESERVATION_IMPORT_COMMIT_STALE_ERROR };
  }
  if (error.status === 400) {
    const msg = error.message.toLowerCase();
    if (msg.includes("pending") || msg.includes("unresolved booking conflicts")) {
      return {
        kind: "not_ready",
        message: RESERVATION_IMPORT_COMMIT_UNRESOLVED_CONFLICTS,
      };
    }
    if (
      msg.includes("overlapping keep_csv") ||
      msg.includes("exclusivity") ||
      msg.includes("shared replace")
    ) {
      return {
        kind: "not_ready",
        message: RESERVATION_IMPORT_COMMIT_SHARED_REPLACE_ISSUE,
      };
    }
    if (
      msg.includes("must be positive") ||
      msg.includes("missing amount") ||
      msg.includes("amount is invalid") ||
      msg.includes("invalid frozen price")
    ) {
      return {
        kind: "not_ready",
        message: RESERVATION_IMPORT_COMMIT_INVALID_AMOUNT,
      };
    }
    // Invalid explicit currency is a blocker; missing currency resolves to EUR and must not block.
    if (
      msg.includes("currency is invalid") ||
      msg.includes("invalid currency")
    ) {
      return {
        kind: "not_ready",
        message: RESERVATION_IMPORT_COMMIT_INVALID_CURRENCY,
      };
    }
    if (
      msg.includes("commit blocked") ||
      msg.includes("unresolved") ||
      msg.includes("recheck")
    ) {
      return { kind: "not_ready", message: RESERVATION_IMPORT_COMMIT_NOT_READY_ERROR };
    }
  }
  return { kind: "generic", message: RESERVATION_IMPORT_COMMIT_ERROR };
}
