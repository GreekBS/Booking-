import { StayPeriod } from "../shared/value-objects/StayPeriod";
import type { ReservationImportRowRecord } from "./ReservationImportTypes";
import {
  parseConflictSnapshot,
  type ReservationImportConflictSnapshot,
} from "./ReservationImportConflictGraph";

/**
 * Availability reason codes that must not block import readiness by themselves.
 * Booking occupancy conflicts are represented via calendar-block scan → existingBookingIds.
 * TURNOVER_BUFFER remains intentionally non-fatal (unchanged product policy).
 */
export const IMPORT_AVAILABILITY_NON_FATAL_CODES = new Set([
  "BLOCKED",
  "DATES_BLOCKED",
  "TURNOVER_BUFFER",
]);

export function isImportAvailabilityNonFatalCode(code: string): boolean {
  return IMPORT_AVAILABILITY_NON_FATAL_CODES.has(code);
}

export function importRowsOverlap(
  a: Pick<ReservationImportRowRecord, "unitId" | "checkIn" | "checkOut">,
  b: Pick<ReservationImportRowRecord, "unitId" | "checkIn" | "checkOut">,
): boolean {
  if (a.unitId !== b.unitId) return false;
  return StayPeriod.create(a.checkIn, a.checkOut).overlaps(
    StayPeriod.create(b.checkIn, b.checkOut),
  );
}

/** Direct overlap peers currently marked keep_csv (excluding self). */
export function findOverlappingKeepCsvPeers(
  row: ReservationImportRowRecord,
  allRows: ReservationImportRowRecord[],
): ReservationImportRowRecord[] {
  return allRows.filter(
    (other) =>
      other.id !== row.id &&
      other.conflictResolution === "keep_csv" &&
      importRowsOverlap(row, other),
  );
}

/**
 * Server invariant: no two keep_csv rows on the same unit may overlap [checkIn, checkOut).
 */
export function findKeepCsvExclusivityViolations(
  rows: ReservationImportRowRecord[],
): Array<{ aId: string; bId: string }> {
  const selected = rows.filter((r) => r.conflictResolution === "keep_csv");
  const violations: Array<{ aId: string; bId: string }> = [];
  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const a = selected[i]!;
      const b = selected[j]!;
      if (importRowsOverlap(a, b)) {
        violations.push({ aId: a.id, bId: b.id });
      }
    }
  }
  return violations;
}

export function assertKeepCsvExclusivity(
  rows: ReservationImportRowRecord[],
): void {
  const violations = findKeepCsvExclusivityViolations(rows);
  if (violations.length > 0) {
    const first = violations[0]!;
    throw new Error(
      `CSV import exclusivity violated: overlapping keep_csv rows ${first.aId} and ${first.bId}`,
    );
  }
}

/**
 * Peer conflicts are resolved when:
 * - no peers, or
 * - this row yields (keep_existing), or
 * - this row keeps CSV and no directly overlapping peer also keeps CSV.
 */
export function arePeerConflictsResolved(
  row: ReservationImportRowRecord,
  allRows: ReservationImportRowRecord[],
  snapshot: ReservationImportConflictSnapshot = parseConflictSnapshot(
    row.conflictSnapshot,
  ),
): boolean {
  if (snapshot.peerImportRowIds.length === 0) return true;
  if (row.conflictResolution === "keep_existing") return true;
  if (row.conflictResolution !== "keep_csv") return false;
  return findOverlappingKeepCsvPeers(row, allRows).length === 0;
}

export function buildRejectedRowPayload(input: {
  externalReference: string | null;
  unitRef: string | null;
  guestName: string | null;
  guestEmail: string | null;
  checkIn: string | null;
  checkOut: string | null;
  guestCount: number | null;
}): Record<string, unknown> {
  return {
    externalReference: input.externalReference,
    unitRef: input.unitRef,
    guestName: input.guestName,
    guestEmail: input.guestEmail,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guestCount: input.guestCount,
  };
}
