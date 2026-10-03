import type {
  CsvImportUnitCandidate,
  CsvImportUnitResolution,
  ICsvImportUnitResolver,
} from "@hcp/domain";
import { createInMemoryCsvImportUnitResolver } from "@hcp/domain";
import { withTenantTransaction } from "../client";

/**
 * Resolves CSV unit refs against tenant units (id / name / slug).
 */
export class PrismaCsvImportUnitResolver implements ICsvImportUnitResolver {
  async resolve(
    tenantId: string,
    unitRef: string,
  ): Promise<CsvImportUnitResolution> {
    const candidates = await this.loadCandidates(tenantId);
    return createInMemoryCsvImportUnitResolver(candidates).resolve(
      tenantId,
      unitRef,
    );
  }

  private async loadCandidates(
    tenantId: string,
  ): Promise<CsvImportUnitCandidate[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const units = await tx.unit.findMany({
        where: { tenantId, deletedAt: null },
        select: { id: true, propertyId: true, name: true, slug: true },
      });
      return units;
    });
  }
}
