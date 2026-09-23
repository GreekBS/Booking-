import type { FiscalAddress } from "../domain/FiscalProfiles";
import type { CustomerBillingType } from "../domain/FiscalProfiles";

/** Immutable issuer copy frozen at issuance — never re-read live profile. */
export interface FiscalIssuerSnapshot {
  businessFiscalProfileId: string;
  propertyId: string;
  legalName: string;
  tradeName: string | null;
  country: string;
  vatNumber: string | null;
  address: FiscalAddress;
  establishmentLocationId: string;
  establishmentCode: string | null;
  fiscalJurisdiction: string;
  accommodationType: string;
  propertyClassification: string | null;
  floorAreaSqm: number | null;
  snappedAt: string;
}

/**
 * Immutable recipient copy.
 * B2C may be minimal (name only / walk-in) when AFM is not required.
 */
export interface FiscalCustomerSnapshot {
  customerBillingProfileId: string | null;
  type: CustomerBillingType | "WALK_IN" | "MINIMAL";
  legalName: string;
  vatNumber: string | null;
  country: string;
  address: FiscalAddress | null;
  email: string | null;
  snappedAt: string;
}

export function minimalB2cCustomerSnapshot(input: {
  legalName?: string | null;
  country?: string;
  now?: Date;
}): FiscalCustomerSnapshot {
  const now = input.now ?? new Date();
  return {
    customerBillingProfileId: null,
    type: "MINIMAL",
    legalName: (input.legalName?.trim() || "Retail customer").slice(0, 255),
    vatNumber: null,
    country: (input.country ?? "GR").toUpperCase(),
    address: null,
    email: null,
    snappedAt: now.toISOString(),
  };
}
