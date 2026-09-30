import type { Result } from "../../shared/kernel/Result";

export type DirectBookingIntegrationStatus = "draft" | "active" | "disabled";
export type DirectBookingEnvironment = "test" | "live";

export interface DirectBookingIntegrationRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId: string;
  publicKeyPrefix: string;
  environment: DirectBookingEnvironment;
  allowedOrigins: string[];
  status: DirectBookingIntegrationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DirectBookingIntegrationPublicLookup {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId: string;
  environment: DirectBookingEnvironment;
  allowedOrigins: string[];
  status: DirectBookingIntegrationStatus;
}

export interface CreateDirectBookingIntegrationParams {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId: string;
  rawPublicKey: string;
  environment: DirectBookingEnvironment;
  allowedOrigins: string[];
  status: DirectBookingIntegrationStatus;
}

export interface CreateDirectBookingIntegrationResult {
  integration: DirectBookingIntegrationRecord;
  /** Shown once at creation — never stored in plaintext. */
  publicKey: string;
}

export interface IDirectBookingIntegrationRepository {
  findByPublicKeyHash(
    publicKeyHash: string,
  ): Promise<DirectBookingIntegrationPublicLookup | null>;

  findById(
    id: string,
    tenantId: string,
  ): Promise<DirectBookingIntegrationRecord | null>;

  listByProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<DirectBookingIntegrationRecord[]>;

  create(
    params: CreateDirectBookingIntegrationParams,
  ): Promise<CreateDirectBookingIntegrationResult>;

  updateStatus(
    id: string,
    tenantId: string,
    status: DirectBookingIntegrationStatus,
  ): Promise<DirectBookingIntegrationRecord>;

  updateAllowedOrigins(
    id: string,
    tenantId: string,
    allowedOrigins: string[],
  ): Promise<DirectBookingIntegrationRecord>;
}

/** Catalog snapshot used by Direct Booking public config / publishability. */
export interface DirectBookingCatalogSnapshot {
  property: {
    id: string;
    tenantId: string;
    name: string;
    slug: string;
    type: "villa" | "apartment" | "hotel" | "other";
    status: "draft" | "active" | "inactive" | "archived";
    timezone: string;
    deletedAt: Date | null;
  };
  unit: {
    id: string;
    propertyId: string;
    name: string;
    slug: string;
    status: "active" | "inactive" | "archived";
    maxGuests: number;
    bedrooms: number;
    bathrooms: number;
    deletedAt: Date | null;
  };
  currency: string;
  hasRatePlan: boolean;
  stayRules: {
    minNights: number;
    maxNights: number;
    checkInDays: number[];
    checkOutDays: number[];
    advanceMinDays: number;
    advanceMaxDays: number;
    turnoverNights: number;
  } | null;
}

export interface IDirectBookingCatalogPort {
  getCatalogSnapshot(
    tenantId: string,
    propertyId: string,
    unitId: string,
  ): Promise<DirectBookingCatalogSnapshot | null>;
}

export type { Result };
