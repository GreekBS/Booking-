import type {
  CsvImportUnitCandidate,
  CsvImportUnitResolution,
  ICsvImportUnitResolver,
} from "@hcp/domain";
import { createInMemoryCsvImportUnitResolver } from "@hcp/domain";
import { withTenantTransaction } from "../client";

/**
 * Resolves CSV unit refs against bookable units of a single property only.
 */
export class PrismaCsvImportUnitResolver implements ICsvImportUnitResolver {
  async listBookableUnits(
    tenantId: string,
    propertyId: string,
  ): Promise<CsvImportUnitCandidate[]> {
    return this.loadCandidates(tenantId, propertyId);
  }

  async resolve(
    tenantId: string,
    propertyId: string,
    unitRef: string,
  ): Promise<CsvImportUnitResolution> {
    const candidates = await this.loadCandidates(tenantId, propertyId);
    return createInMemoryCsvImportUnitResolver(candidates).resolve(
      tenantId,
      propertyId,
      unitRef,
    );
  }

  private async loadCandidates(
    tenantId: string,
    propertyId: string,
  ): Promise<CsvImportUnitCandidate[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const units = await tx.unit.findMany({
        where: {
          tenantId,
          propertyId,
          deletedAt: null,
          status: "active",
        },
        select: {
          id: true,
          propertyId: true,
          name: true,
          slug: true,
          status: true,
        },
      });
      return units;
    });
  }
}
