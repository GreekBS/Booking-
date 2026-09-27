import {
  ConflictError,
  ValidationError,
} from "../../../shared/errors/DomainError";
import { HousekeepingStateMachine } from "../../domain/HousekeepingStateMachine";
import type {
  UnitHousekeepingSource,
  UnitHousekeepingStatusValue,
} from "../../domain/TaskTypes";
import {
  CLEANING_LOCATION_BULK_MAX,
  CLEANING_LOCATION_BULK_MIN,
  CLEANING_LOCATION_NAME_MAX_LENGTH,
  type CleaningLocationRecord,
  type CleaningLocationStatusRecord,
} from "./CleaningLocationTypes";

export function normalizeCleaningLocationName(raw: string): string {
  const name = raw.trim();
  if (!name) {
    throw new ValidationError("Cleaning location name is required");
  }
  if (name.length > CLEANING_LOCATION_NAME_MAX_LENGTH) {
    throw new ValidationError(
      `Cleaning location name cannot exceed ${CLEANING_LOCATION_NAME_MAX_LENGTH} characters`,
    );
  }
  return name;
}

/** Default label for bulk-initialized locations (`1` … `N`). */
export function defaultBulkCleaningLocationName(index: number): string {
  if (!Number.isInteger(index) || index < 1) {
    throw new ValidationError("Bulk location index must be a positive integer");
  }
  return String(index);
}

export function assertBulkCleaningLocationCount(count: number): void {
  if (
    !Number.isInteger(count) ||
    count < CLEANING_LOCATION_BULK_MIN ||
    count > CLEANING_LOCATION_BULK_MAX
  ) {
    throw new ValidationError(
      `Bulk initialize count must be between ${CLEANING_LOCATION_BULK_MIN} and ${CLEANING_LOCATION_BULK_MAX}`,
    );
  }
}

export interface CreateCleaningLocationInput {
  id: string;
  tenantId: string;
  propertyId: string;
  name: string;
  sortOrder?: number;
  commercialUnitId?: string | null;
  now?: Date;
}

export function createCleaningLocation(
  input: CreateCleaningLocationInput,
): CleaningLocationRecord {
  const now = input.now ?? new Date();
  return {
    id: input.id,
    tenantId: input.tenantId,
    propertyId: input.propertyId,
    name: normalizeCleaningLocationName(input.name),
    status: "active",
    sortOrder: input.sortOrder ?? 0,
    commercialUnitId: input.commercialUnitId ?? null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

export function renameCleaningLocation(
  record: CleaningLocationRecord,
  name: string,
  now: Date = new Date(),
): CleaningLocationRecord {
  if (record.status !== "active") {
    throw new ConflictError(
      "Cannot rename an archived cleaning location",
      "cleaning_location_archived",
    );
  }
  return {
    ...record,
    name: normalizeCleaningLocationName(name),
    updatedAt: now,
  };
}

export function archiveCleaningLocation(
  record: CleaningLocationRecord,
  now: Date = new Date(),
): CleaningLocationRecord {
  if (record.status === "archived") {
    return record;
  }
  return {
    ...record,
    status: "archived",
    archivedAt: now,
    updatedAt: now,
  };
}

export function createCleaningLocationStatus(input: {
  cleaningLocationId: string;
  tenantId: string;
  propertyId: string;
  status?: UnitHousekeepingStatusValue;
  source?: UnitHousekeepingSource;
  updatedByUserId?: string | null;
  now?: Date;
}): CleaningLocationStatusRecord {
  const now = input.now ?? new Date();
  return {
    cleaningLocationId: input.cleaningLocationId,
    tenantId: input.tenantId,
    propertyId: input.propertyId,
    status: input.status ?? "CLEAN",
    source: input.source ?? "INIT",
    updatedByUserId: input.updatedByUserId ?? null,
    updatedAt: now,
    version: 1,
  };
}

function assertExpectedVersion(
  record: CleaningLocationStatusRecord,
  expectedVersion: number,
): void {
  if (record.version !== expectedVersion) {
    throw new ConflictError(
      "Cleaning location status version conflict",
      "cleaning_location_status_version_conflict",
    );
  }
}

/**
 * Apply a CLEAN transition with optimistic versioning.
 * Returns `{ changed: false }` when already CLEAN (no-op success).
 */
export function markCleaningLocationClean(
  record: CleaningLocationStatusRecord,
  expectedVersion: number,
  source: UnitHousekeepingSource,
  updatedByUserId: string | null,
  at: Date = new Date(),
): { record: CleaningLocationStatusRecord; changed: boolean } {
  assertExpectedVersion(record, expectedVersion);
  if (HousekeepingStateMachine.isNoOp(record.status, "CLEAN")) {
    return { record, changed: false };
  }
  HousekeepingStateMachine.assertCanTransition(record.status, "CLEAN");
  return {
    record: {
      ...record,
      status: "CLEAN",
      source,
      updatedByUserId,
      updatedAt: at,
      version: record.version + 1,
    },
    changed: true,
  };
}

/**
 * Apply a DIRTY transition with optimistic versioning.
 * Returns `{ changed: false }` when already DIRTY (no-op success).
 */
export function markCleaningLocationDirty(
  record: CleaningLocationStatusRecord,
  expectedVersion: number,
  source: UnitHousekeepingSource,
  updatedByUserId: string | null,
  at: Date = new Date(),
): { record: CleaningLocationStatusRecord; changed: boolean } {
  assertExpectedVersion(record, expectedVersion);
  if (HousekeepingStateMachine.isNoOp(record.status, "DIRTY")) {
    return { record, changed: false };
  }
  HousekeepingStateMachine.assertCanTransition(record.status, "DIRTY");
  return {
    record: {
      ...record,
      status: "DIRTY",
      source,
      updatedByUserId,
      updatedAt: at,
      version: record.version + 1,
    },
    changed: true,
  };
}
