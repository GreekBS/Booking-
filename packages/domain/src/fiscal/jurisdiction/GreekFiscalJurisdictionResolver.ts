import { ConflictError, ValidationError } from "../../shared/errors/DomainError";
import {
  findGreekFiscalLocation,
  greekFiscalLocationCatalogForOperator,
  type GreekFiscalLocationRecord,
} from "./greekFiscalJurisdictionCatalog";

export type GreekVatJurisdictionCode = "GR" | "GR-ISLAND-REDUCED";

export interface GreekFiscalJurisdictionResolveInput {
  /** Stable catalog location id from BusinessFiscalProfile. */
  establishmentLocationId: string;
  asOf: Date;
  /**
   * Establishment / branch is located in the eligible island area
   * (VAT Code Art. 26 service conditions).
   */
  establishmentInEligibleArea: boolean;
  /**
   * Accommodation/service is physically executed in the eligible area.
   */
  servicePhysicallyExecutedInEligibleArea: boolean;
}

export interface GreekFiscalJurisdictionResolution {
  jurisdiction: GreekVatJurisdictionCode;
  locationId: string;
  location: GreekFiscalLocationRecord;
  legalSource: string;
  legalVersion: string;
}

/**
 * Derives VAT jurisdiction from verified location catalog + service conditions.
 * Never accepts a free operator-selected GR-ISLAND-REDUCED shortcut.
 * TaxEngine remains geography-agnostic — it only receives the resolved code.
 */
export class GreekFiscalJurisdictionResolver {
  constructor(
    private readonly catalog: readonly GreekFiscalLocationRecord[] = greekFiscalLocationCatalogForOperator(),
  ) {}

  resolve(input: GreekFiscalJurisdictionResolveInput): GreekFiscalJurisdictionResolution {
    const locationId = input.establishmentLocationId?.trim();
    if (!locationId) {
      throw new ValidationError(
        "establishmentLocationId required to resolve Greek VAT jurisdiction",
      );
    }

    const matches = findGreekFiscalLocation(locationId, input.asOf, this.catalog);
    if (matches.length === 0) {
      throw new ValidationError(
        `No effective Greek fiscal location for ${locationId} at ${input.asOf.toISOString()}`,
      );
    }
    if (matches.length > 1) {
      throw new ConflictError(
        `Conflicting Greek fiscal location records for ${locationId}`,
        "greek_jurisdiction_ambiguous",
      );
    }

    const location = matches[0]!;

    if (!location.eligibleForReducedVat) {
      return {
        jurisdiction: "GR",
        locationId: location.locationId,
        location,
        legalSource: location.legalSource,
        legalVersion: location.legalVersion,
      };
    }

    // Eligible catalog location — reduced VAT only when statutory service conditions hold.
    if (
      !input.establishmentInEligibleArea ||
      !input.servicePhysicallyExecutedInEligibleArea
    ) {
      throw new ValidationError(
        "Reduced island VAT requires establishment in the eligible area and " +
          "physical execution of the accommodation service there",
      );
    }

    return {
      jurisdiction: "GR-ISLAND-REDUCED",
      locationId: location.locationId,
      location,
      legalSource: location.legalSource,
      legalVersion: location.legalVersion,
    };
  }
}

export const greekFiscalJurisdictionResolver = new GreekFiscalJurisdictionResolver();
