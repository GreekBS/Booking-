import { ValidationError } from "../../shared/errors/DomainError";
import { Result } from "../../shared/kernel/Result";
import { PropertySlug } from "../../shared/value-objects/Slug";

/** Soft cap per bulk request — larger hotels use multiple batches. */
export const MAX_BULK_CREATE_UNITS = 200;

export type BulkRoomNumbering =
  | {
      mode: "sequential";
      /** Optional prefix before the number (e.g. "A" → A101). */
      prefix?: string;
      start: number;
      count: number;
      /** Zero-pad width for the numeric part. Default: digits of (start+count-1). */
      padWidth?: number;
    }
  | {
      mode: "explicit";
      roomNumbers: string[];
    };

export interface PlannedPhysicalUnit {
  name: string;
  slug: string;
  roomNumber: string;
  floor: string | null;
  maxGuests: number;
  roomTypeId: string;
  bedrooms: number;
  bathrooms: number;
}

export interface PlanBulkPhysicalUnitsInput {
  roomTypeId: string;
  roomTypeName: string;
  maxGuests: number;
  bedrooms?: number;
  bathrooms?: number;
  floor?: string | null;
  numbering: BulkRoomNumbering;
  /** Existing non-deleted room numbers (normalized lower trim) on the property. */
  existingRoomNumbers?: Iterable<string>;
  /** Existing non-deleted unit slugs on the property. */
  existingSlugs?: Iterable<string>;
}

function normalizeRoomNumber(value: string): string {
  return value.trim().toLowerCase();
}

function buildRoomNumbers(numbering: BulkRoomNumbering): Result<string[], Error> {
  if (numbering.mode === "explicit") {
    if (!Array.isArray(numbering.roomNumbers) || numbering.roomNumbers.length === 0) {
      return Result.fail(new ValidationError("roomNumbers must be a non-empty list"));
    }
    if (numbering.roomNumbers.length > MAX_BULK_CREATE_UNITS) {
      return Result.fail(
        new ValidationError(
          `Cannot create more than ${MAX_BULK_CREATE_UNITS} units in one request`,
        ),
      );
    }
    const numbers = numbering.roomNumbers.map((n) => n.trim());
    if (numbers.some((n) => n.length === 0)) {
      return Result.fail(new ValidationError("Room numbers must not be blank"));
    }
    return Result.ok(numbers);
  }

  const { start, count, prefix, padWidth } = numbering;
  if (!Number.isInteger(start) || start < 0) {
    return Result.fail(new ValidationError("start must be a non-negative integer"));
  }
  if (!Number.isInteger(count) || count < 1) {
    return Result.fail(new ValidationError("count must be a positive integer"));
  }
  if (count > MAX_BULK_CREATE_UNITS) {
    return Result.fail(
      new ValidationError(
        `Cannot create more than ${MAX_BULK_CREATE_UNITS} units in one request`,
      ),
    );
  }
  const end = start + count - 1;
  const width =
    padWidth ??
    Math.max(String(start).length, String(end).length);
  if (!Number.isInteger(width) || width < 1 || width > 16) {
    return Result.fail(new ValidationError("padWidth must be between 1 and 16"));
  }
  const prefixText = (prefix ?? "").trim();
  const numbers: string[] = [];
  for (let n = start; n <= end; n += 1) {
    numbers.push(`${prefixText}${String(n).padStart(width, "0")}`);
  }
  return Result.ok(numbers);
}

function allocateSlug(baseName: string, used: Set<string>): string {
  const candidate = PropertySlug.fromName(baseName).value;
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }
  for (let i = 2; i < 10_000; i += 1) {
    const suffix = `-${i}`;
    const truncated = candidate.slice(0, Math.max(3, 63 - suffix.length));
    const next = PropertySlug.create(`${truncated}${suffix}`.replace(/-+$/g, "")).value;
    if (!used.has(next)) {
      used.add(next);
      return next;
    }
  }
  throw new ValidationError("Unable to allocate a unique unit slug");
}

/**
 * Pure planner for hotel physical rooms. Does not persist.
 * Enforces batch uniqueness and optional conflict checks against existing inventory.
 */
export function planBulkPhysicalUnits(
  input: PlanBulkPhysicalUnitsInput,
): Result<PlannedPhysicalUnit[], Error> {
  const numbersResult = buildRoomNumbers(input.numbering);
  if (numbersResult.isFailure) return Result.fail(numbersResult.getError());
  const roomNumbers = numbersResult.getValue();

  const seen = new Set<string>();
  for (const roomNumber of roomNumbers) {
    const key = normalizeRoomNumber(roomNumber);
    if (seen.has(key)) {
      return Result.fail(
        new ValidationError(`Duplicate room number in request: ${roomNumber}`),
      );
    }
    seen.add(key);
  }

  const existingNumbers = new Set(
    [...(input.existingRoomNumbers ?? [])].map((n) => normalizeRoomNumber(n)),
  );
  for (const roomNumber of roomNumbers) {
    if (existingNumbers.has(normalizeRoomNumber(roomNumber))) {
      return Result.fail(
        new ValidationError(`Room number already exists: ${roomNumber}`),
      );
    }
  }

  const usedSlugs = new Set([...(input.existingSlugs ?? [])]);
  const floor = input.floor?.trim() ? input.floor.trim() : null;
  const typeName = input.roomTypeName.trim() || "Room";
  const planned: PlannedPhysicalUnit[] = [];

  try {
    for (const roomNumber of roomNumbers) {
      const name = `${typeName} ${roomNumber}`.trim();
      const slug = allocateSlug(`room-${roomNumber}`, usedSlugs);
      planned.push({
        name,
        slug,
        roomNumber,
        floor,
        maxGuests: input.maxGuests,
        roomTypeId: input.roomTypeId,
        bedrooms: input.bedrooms ?? 1,
        bathrooms: input.bathrooms ?? 1,
      });
    }
  } catch (error) {
    return Result.fail(error instanceof Error ? error : new Error(String(error)));
  }

  return Result.ok(planned);
}
