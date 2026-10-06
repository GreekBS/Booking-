import type { UnitHousekeepingStatusValue } from "../../domain/TaskTypes";

/** Row returned by SECURITY DEFINER lookup_active_cleaning_qr_by_token_hash. */
export interface PublicCleaningQrLookupRow {
  kind: "location" | "unit";
  qrAccessId: string;
  tenantId: string;
  propertyId: string;
  unitId: string | null;
  cleaningLocationId: string | null;
  tokenHash: string;
}

export interface IPublicCleaningQrLookup {
  /**
   * Resolve an ACTIVE QR by SHA-256 token hash without a tenant GUC.
   * Uses SECURITY DEFINER — token entropy is the access control.
   */
  findActiveByTokenHash(
    tokenHash: string,
  ): Promise<PublicCleaningQrLookupRow | null>;
}

export interface PropertyStaffPinRecord {
  propertyId: string;
  tenantId: string;
  pinHash: string | null;
  failedAttempts: number;
  lockedUntil: Date | null;
  updatedAt: Date | null;
  websiteUrl: string | null;
  propertyName: string;
}

export interface IPropertyStaffPinRepository {
  getForProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<PropertyStaffPinRecord | null>;

  /** Returns public-safe fields only — never pinHash. */
  getPublicMeta(
    tenantId: string,
    propertyId: string,
  ): Promise<{
    propertyId: string;
    propertyName: string;
    websiteUrl: string | null;
    pinConfigured: boolean;
    lockedUntil: Date | null;
  } | null>;

  setPinHash(
    tenantId: string,
    propertyId: string,
    pinHash: string,
    now?: Date,
  ): Promise<void>;

  recordFailedAttempt(
    tenantId: string,
    propertyId: string,
    input: { failedAttempts: number; lockedUntil: Date | null },
  ): Promise<void>;

  clearFailures(tenantId: string, propertyId: string): Promise<void>;
}

export interface StaffHousekeepingStatusView {
  tenantId: string;
  propertyId: string;
  propertyName: string;
  locationId: string;
  locationName: string;
  unitId: string | null;
  unitName: string | null;
  status: UnitHousekeepingStatusValue;
  version: number;
  updatedAt: Date;
}
