import { ConflictError } from "../../shared/errors/DomainError";
import { StayPeriod } from "../shared/value-objects/StayPeriod";
import { Money } from "../shared/value-objects/Money";
import type { ActiveCalendarBlock } from "../shared/types/CommerceTypes";
import { importAvailabilityPolicyForTemporalClass } from "./ImportAvailabilityPolicy";
import {
  assertKeepCsvExclusivity,
  findKeepCsvExclusivityViolations,
  isImportAvailabilityNonFatalCode,
} from "./ReservationImportExclusivity";
import { setsEqual } from "./ReservationImportCommitEligibility";
import type { ReservationImportRowRecord } from "./ReservationImportTypes";
import type { Booking } from "../booking/domain/Booking";
import type { AvailabilityEvaluationResult } from "../availability/AvailabilityEvaluator";

export { isImportAvailabilityNonFatalCode };

/** Scan active blocks for booking conflicts / non-booking blockers (same shape as preflight). */
export function scanImportCalendarConflicts(input: {
  checkIn: string;
  checkOut: string;
  activeBlocks: ActiveCalendarBlock[];
  /** Booking source ids to ignore (released replace targets within this TX). */
  excludeSourceIds?: string[];
}): {
  existingBookingIds: string[];
  nonBookingBlockers: Array<{
    blockType: string;
    sourceId: string | null;
    checkIn: string;
    checkOut: string;
    message: string;
  }>;
} {
  const exclude = new Set(input.excludeSourceIds ?? []);
  const stay = StayPeriod.create(input.checkIn, input.checkOut);
  const existingBookingIds: string[] = [];
  const nonBookingBlockers: Array<{
    blockType: string;
    sourceId: string | null;
    checkIn: string;
    checkOut: string;
    message: string;
  }> = [];

  for (const block of input.activeBlocks) {
    if (block.status !== "active") continue;
    if (block.sourceId && exclude.has(block.sourceId)) continue;
    const blockPeriod = StayPeriod.create(block.checkIn, block.checkOut);
    if (!stay.overlaps(blockPeriod)) continue;

    if (block.blockType === "booking" && block.sourceId) {
      existingBookingIds.push(block.sourceId);
    } else if (
      block.blockType === "manual" ||
      block.blockType === "maintenance" ||
      block.blockType === "cleaning" ||
      block.blockType === "owner"
    ) {
      nonBookingBlockers.push({
        blockType: block.blockType,
        sourceId: block.sourceId,
        checkIn: block.checkIn,
        checkOut: block.checkOut,
        message: `Dates overlap with ${block.blockType} block`,
      });
    }
  }

  return {
    existingBookingIds: [...new Set(existingBookingIds)],
    nonBookingBlockers,
  };
}

export function assertAvailabilityAllowsImport(
  row: ReservationImportRowRecord,
  evaluation: AvailabilityEvaluationResult,
): void {
  const blocking = evaluation.reasons.filter(
    (r) => !isImportAvailabilityNonFatalCode(r.code),
  );
  if (blocking.length > 0) {
    throw new ConflictError(
      `Import commit blocked: row ${row.rowNumber} availability failed (${blocking[0]!.code})`,
    );
  }
}

export function assertKeepCsvReplaceTargetsValid(input: {
  row: ReservationImportRowRecord;
  liveExistingBookingIds: string[];
  targets: Booking[];
}): void {
  const { row, liveExistingBookingIds, targets } = input;
  const expected = [...(row.replaceBookingIds ?? [])].sort();
  const live = [...liveExistingBookingIds].sort();

  if (!setsEqual(expected, live)) {
    throw new ConflictError(
      `Import commit blocked: row ${row.rowNumber} replaceBookingIds are stale — recheck required`,
    );
  }

  const byId = new Map(targets.map((b) => [b.id, b]));
  for (const id of expected) {
    const booking = byId.get(id);
    if (!booking) {
      throw new ConflictError(
        `Import commit blocked: row ${row.rowNumber} replace target ${id} not found`,
      );
    }
    if (booking.tenantId !== row.tenantId) {
      throw new ConflictError(
        `Import commit blocked: row ${row.rowNumber} replace target ${id} tenant mismatch`,
      );
    }
    if (booking.unitId !== row.unitId) {
      throw new ConflictError(
        `Import commit blocked: row ${row.rowNumber} replace target ${id} unit mismatch`,
      );
    }
    if (booking.status !== "completed") {
      throw new ConflictError(
        `Import commit blocked: row ${row.rowNumber} replace target ${id} is not supersedeable (status: ${booking.status}) — recheck required`,
      );
    }
    if (booking.isSuperseded) {
      throw new ConflictError(
        `Import commit blocked: row ${row.rowNumber} replace target ${id} is already superseded — recheck required`,
      );
    }
  }
}

export function assertNoNonBookingBlockers(
  row: ReservationImportRowRecord,
  blockers: Array<{ blockType: string; message: string }>,
): void {
  if (blockers.length > 0) {
    throw new ConflictError(
      `Import commit blocked: row ${row.rowNumber} has ${blockers[0]!.blockType} blocker — recheck required`,
    );
  }
}

export function assertPeerExclusivityForCommit(
  importRows: ReservationImportRowRecord[],
): void {
  const violations = findKeepCsvExclusivityViolations(importRows);
  if (violations.length > 0) {
    assertKeepCsvExclusivity(importRows);
  }
}

export function moneyFromFrozen(amount: string, currency: string): Money {
  return Money.create(amount, currency);
}

export function importAvailabilityPolicyForRow(row: ReservationImportRowRecord) {
  return importAvailabilityPolicyForTemporalClass(row.temporalClass);
}

export function csvImportSupersedeReason(): string {
  return "csv_import_replaced";
}
