/**
 * CleaningLocation V1 — ops-only cleaning spaces (ADR companion to QR Cleaning).
 * Independent of commercial Units; commercialUnitId is an optional legacy link.
 */

import type { UnitQrStatus } from "./CleaningTypes";
import type {
  UnitHousekeepingSource,
  UnitHousekeepingStatusValue,
} from "../../domain/TaskTypes";

export const CLEANING_LOCATION_STATUSES = ["active", "archived"] as const;
export type CleaningLocationLifecycleStatus =
  (typeof CLEANING_LOCATION_STATUSES)[number];

/** Hard caps mirrored by validators and the bulk-initialize use case. */
export const CLEANING_LOCATION_BULK_MIN = 1;
export const CLEANING_LOCATION_BULK_MAX = 300;

export const CLEANING_LOCATION_NAME_MAX_LENGTH = 255;

export interface CleaningLocationRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  name: string;
  status: CleaningLocationLifecycleStatus;
  sortOrder: number;
  commercialUnitId: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface CleaningLocationStatusRecord {
  cleaningLocationId: string;
  tenantId: string;
  propertyId: string;
  status: UnitHousekeepingStatusValue;
  source: UnitHousekeepingSource;
  updatedByUserId: string | null;
  updatedAt: Date;
  version: number;
}

export interface CleaningLocationQrAccessRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  cleaningLocationId: string;
  tokenHash: string;
  status: UnitQrStatus;
  createdAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

/** Compact open-task summary for the locations board (no sensitive fields). */
export interface CleaningLocationBoardOpenTask {
  id: string;
  title: string;
  status: string;
  priority: string;
}

/**
 * One board row per active location.
 * Never includes QR plaintext — only `hasActiveQr`.
 */
export interface CleaningLocationBoardRow {
  locationId: string;
  propertyId: string;
  name: string;
  sortOrder: number;
  commercialUnitId: string | null;
  readinessStatus: UnitHousekeepingStatusValue;
  readinessVersion: number;
  readinessSource: UnitHousekeepingSource;
  lastCompletedAt: Date | null;
  openTask: CleaningLocationBoardOpenTask | null;
  hasActiveQr: boolean;
}
