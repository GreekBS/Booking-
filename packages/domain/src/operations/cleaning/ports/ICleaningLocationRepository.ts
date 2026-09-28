import type { UnitHousekeepingSource } from "../../domain/TaskTypes";
import type {
  CleaningLocationBoardRow,
  CleaningLocationRecord,
  CleaningLocationStatusRecord,
} from "../domain/CleaningLocationTypes";

export interface BulkCreateCleaningLocationsCommand {
  tenantId: string;
  propertyId: string;
  count: number;
  actorUserId: string;
  now?: Date;
}

/**
 * Idempotent single-location ensure for villa/apartment/other.
 * Reuses any existing active location; creates one only when none exist.
 * Concurrency-safe via property row lock (same as bulkCreate).
 */
export interface EnsureSingleCleaningLocationCommand {
  tenantId: string;
  propertyId: string;
  name: string;
  actorUserId: string;
  now?: Date;
}

export interface AddCleaningLocationCommand {
  tenantId: string;
  propertyId: string;
  name: string;
  actorUserId: string;
  commercialUnitId?: string | null;
  now?: Date;
}

export interface RenameCleaningLocationCommand {
  tenantId: string;
  locationId: string;
  name: string;
  now?: Date;
}

export interface ArchiveCleaningLocationCommand {
  tenantId: string;
  locationId: string;
  now?: Date;
}

export interface MarkCleaningLocationStatusCommand {
  tenantId: string;
  locationId: string;
  expectedVersion: number;
  source: UnitHousekeepingSource;
  updatedByUserId: string | null;
  now?: Date;
}

export interface ICleaningLocationRepository {
  listActiveByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<CleaningLocationRecord[]>;

  findById(
    tenantId: string,
    locationId: string,
  ): Promise<CleaningLocationRecord | null>;

  /** Active location linked to a commercial unit, if any. */
  findActiveByCommercialUnit(
    tenantId: string,
    unitId: string,
  ): Promise<CleaningLocationRecord | null>;

  countActiveByProperty(tenantId: string, propertyId: string): Promise<number>;

  /**
   * Atomically create `count` active locations (names `1`…`N`) with CLEAN status.
   * Rejects with ConflictError when the property already has any active location.
   */
  bulkCreate(
    command: BulkCreateCleaningLocationsCommand,
  ): Promise<CleaningLocationRecord[]>;

  /**
   * Ensure exactly one active location exists for single-property mode.
   * If any active locations exist, returns the first (sortOrder/name) without
   * creating duplicates. Never archives or merges existing rows.
   */
  ensureSingleActive(
    command: EnsureSingleCleaningLocationCommand,
  ): Promise<{ location: CleaningLocationRecord; created: boolean }>;

  add(command: AddCleaningLocationCommand): Promise<CleaningLocationRecord>;

  rename(
    command: RenameCleaningLocationCommand,
  ): Promise<CleaningLocationRecord>;

  archive(
    command: ArchiveCleaningLocationCommand,
  ): Promise<CleaningLocationRecord>;

  /**
   * Active locations with readiness, last completed execution, open HK task,
   * and QR presence. Never returns plaintext tokens.
   */
  getBoard(
    tenantId: string,
    propertyId: string,
  ): Promise<CleaningLocationBoardRow[]>;

  /** Insert CLEAN/INIT if missing (idempotent). Returns current row. */
  ensureStatusInitialized(input: {
    tenantId: string;
    propertyId: string;
    locationId: string;
  }): Promise<CleaningLocationStatusRecord>;

  markClean(
    command: MarkCleaningLocationStatusCommand,
  ): Promise<CleaningLocationStatusRecord>;

  markDirty(
    command: MarkCleaningLocationStatusCommand,
  ): Promise<CleaningLocationStatusRecord>;
}
