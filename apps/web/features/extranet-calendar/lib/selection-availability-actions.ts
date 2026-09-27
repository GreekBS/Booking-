import { rangesOverlap } from "@/features/availability/lib/calendar-utils";
import {
  createOperatorBlock,
  releaseOperatorBlock,
  updateAvailabilityRules,
} from "@/lib/admin/api";
import type {
  AvailabilityRulesRecord,
  CalendarRecord,
  OperatorBlockType,
} from "@/lib/admin/types";
import { OPERATOR_BLOCK_TYPES } from "@/lib/admin/types";

export interface ExclusiveDateRange {
  checkIn: string;
  checkOut: string;
}

export function validateExclusiveDateRange(range: ExclusiveDateRange): string | null {
  if (!range.checkIn) return "Απαιτείται check-in";
  if (!range.checkOut) return "Απαιτείται check-out";
  if (range.checkOut <= range.checkIn) return "Το check-out πρέπει να είναι μετά το check-in";
  return null;
}

export async function createBlockForDateRange(params: {
  tenantId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  blockType: OperatorBlockType;
  reason?: string | null;
}): Promise<void> {
  const rangeError = validateExclusiveDateRange(params);
  if (rangeError) throw new Error(rangeError);

  await createOperatorBlock(params.tenantId, params.unitId, {
    checkIn: params.checkIn,
    checkOut: params.checkOut,
    blockType: params.blockType,
    reason: params.reason ?? null,
  });
}

export async function openDatesForDateRange(params: {
  tenantId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  calendar: CalendarRecord | undefined;
}): Promise<number> {
  const rangeError = validateExclusiveDateRange(params);
  if (rangeError) throw new Error(rangeError);

  if (!params.calendar) {
    throw new Error("Το ημερολόγιο δεν έχει φορτωθεί ακόμα");
  }

  const blocks = params.calendar.blocks.filter(
    (b) =>
      b.status === "active" &&
      OPERATOR_BLOCK_TYPES.includes(b.blockType as OperatorBlockType) &&
      rangesOverlap(b.checkIn, b.checkOut, params.checkIn, params.checkOut),
  );

  await Promise.all(
    blocks.map((b) => releaseOperatorBlock(params.tenantId, params.unitId, b.id)),
  );

  return blocks.length;
}

export async function updateUnitMinStay(params: {
  tenantId: string;
  unitId: string;
  minNights: number;
  rules: AvailabilityRulesRecord | undefined;
}): Promise<AvailabilityRulesRecord> {
  if (!Number.isInteger(params.minNights) || params.minNights < 1) {
    throw new Error("Η ελάχ. διαμονή πρέπει να είναι θετικός ακέραιος");
  }

  if (!params.rules) {
    throw new Error("Δεν φορτώθηκαν κανόνες διαθεσιμότητας για αυτή τη μονάδα");
  }

  return updateAvailabilityRules(params.tenantId, params.unitId, {
    ...params.rules,
    minNights: params.minNights,
  });
}
