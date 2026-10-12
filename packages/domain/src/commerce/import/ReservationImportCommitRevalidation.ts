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

/** Stable machine codes for keep_csv replace-target validation (UI maps to Greek). */
export type KeepCsvReplaceTargetIssueCode =
  | "REPLACE_TARGETS_STALE"
  | "REPLACE_TARGET_NOT_FOUND"
  | "REPLACE_TARGET_TENANT_MISMATCH"
  | "REPLACE_TARGET_UNIT_MISMATCH"
  | "REPLACE_TARGET_NOT_SUPERSEDEABLE"
  | "REPLACE_TARGET_ALREADY_SUPERSEDED";

export interface KeepCsvReplaceTargetIssue {
  code: KeepCsvReplaceTargetIssueCode;
  bookingId?: string;
  bookingStatus?: string;
}

/**
 * Shared keep_csv replace-target rules for draft preflight and commit.
 * Only `completed` + non-superseded bookings may be replaced (policy unchanged).
 */
export function evaluateKeepCsvReplaceTargets(input: {
  row: ReservationImportRowRecord;
  liveExistingBookingIds: string[];
  targets: Booking[];
  /** Commit must match live calendar overlaps; preflight may skip. */
  requireLiveSetEquality?: boolean;
}): KeepCsvReplaceTargetIssue | null {
  const requireLiveSetEquality = input.requireLiveSetEquality !== false;
  const expected = [...(input.row.replaceBookingIds ?? [])].sort();
  const live = [...input.liveExistingBookingIds].sort();

  if (requireLiveSetEquality && !setsEqual(expected, live)) {
    return { code: "REPLACE_TARGETS_STALE" };
  }

  const byId = new Map(input.targets.map((b) => [b.id, b]));
  for (const id of expected) {
    const booking = byId.get(id);
    if (!booking) {
      return { code: "REPLACE_TARGET_NOT_FOUND", bookingId: id };
    }
    if (booking.tenantId !== input.row.tenantId) {
      return {
        code: "REPLACE_TARGET_TENANT_MISMATCH",
        bookingId: id,
        bookingStatus: booking.status,
      };
    }
    if (booking.unitId !== input.row.unitId) {
      return {
        code: "REPLACE_TARGET_UNIT_MISMATCH",
        bookingId: id,
        bookingStatus: booking.status,
      };
    }
    if (booking.status !== "completed") {
      return {
        code: "REPLACE_TARGET_NOT_SUPERSEDEABLE",
        bookingId: id,
        bookingStatus: booking.status,
      };
    }
    if (booking.isSuperseded) {
      return {
        code: "REPLACE_TARGET_ALREADY_SUPERSEDED",
        bookingId: id,
        bookingStatus: booking.status,
      };
    }
  }
  return null;
}

export function assertKeepCsvReplaceTargetsValid(input: {
  row: ReservationImportRowRecord;
  liveExistingBookingIds: string[];
  targets: Booking[];
}): void {
  const issue = evaluateKeepCsvReplaceTargets({
    ...input,
    requireLiveSetEquality: true,
  });
  if (!issue) return;

  const rowNo = input.row.rowNumber;
  const id = issue.bookingId ?? "?";
  switch (issue.code) {
    case "REPLACE_TARGETS_STALE":
      throw new ConflictError(
        `Import commit blocked: row ${rowNo} replaceBookingIds are stale — recheck required`,
        issue.code,
      );
    case "REPLACE_TARGET_NOT_FOUND":
      throw new ConflictError(
        `Import commit blocked: row ${rowNo} replace target ${id} not found`,
        issue.code,
      );
    case "REPLACE_TARGET_TENANT_MISMATCH":
      throw new ConflictError(
        `Import commit blocked: row ${rowNo} replace target ${id} tenant mismatch`,
        issue.code,
      );
    case "REPLACE_TARGET_UNIT_MISMATCH":
      throw new ConflictError(
        `Import commit blocked: row ${rowNo} replace target ${id} unit mismatch`,
        issue.code,
      );
    case "REPLACE_TARGET_NOT_SUPERSEDEABLE":
      throw new ConflictError(
        `Import commit blocked: row ${rowNo} replace target ${id} is not supersedeable (status: ${issue.bookingStatus}) — recheck required`,
        issue.code,
      );
    case "REPLACE_TARGET_ALREADY_SUPERSEDED":
      throw new ConflictError(
        `Import commit blocked: row ${rowNo} replace target ${id} is already superseded — recheck required`,
        issue.code,
      );
    default:
      throw new ConflictError(
        `Import commit blocked: row ${rowNo} replace targets invalid`,
        "REPLACE_TARGETS_STALE",
      );
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
