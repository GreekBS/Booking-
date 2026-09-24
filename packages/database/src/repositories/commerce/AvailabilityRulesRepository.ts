import type { IAvailabilityRulesRepository } from "@hcp/domain";
import { randomUUID } from "node:crypto";
import { withTenantTransaction } from "../../client";
import { availabilityRulesToDomain } from "./commerceMappers";

export class PrismaAvailabilityRulesRepository implements IAvailabilityRulesRepository {
  async findByUnitId(unitId: string, tenantId: string) {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.unitAvailabilityRule.findFirst({
        where: { unitId, tenantId },
      });

      return record ? availabilityRulesToDomain(record) : null;
    });
  }

  async findByUnitIds(
    unitIds: string[],
    tenantId: string,
  ): Promise<Map<string, import("@hcp/domain").UnitAvailabilityRulesProps>> {
    const result = new Map<string, import("@hcp/domain").UnitAvailabilityRulesProps>();
    if (unitIds.length === 0) return result;

    return withTenantTransaction(tenantId, async (tx) => {
      const records = await tx.unitAvailabilityRule.findMany({
        where: { tenantId, unitId: { in: unitIds } },
      });

      for (const record of records) {
        result.set(record.unitId, availabilityRulesToDomain(record));
      }
      return result;
    });
  }

  async save(
    tenantId: string,
    unitId: string,
    rules: Parameters<IAvailabilityRulesRepository["save"]>[2],
  ): Promise<void> {
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.unitAvailabilityRule.upsert({
        where: { unitId },
        create: {
          id: randomUUID(),
          tenantId,
          unitId,
          minNights: rules.minNights,
          maxNights: rules.maxNights,
          checkInDays: rules.checkInDays,
          checkOutDays: rules.checkOutDays,
          advanceMinDays: rules.advanceMinDays,
          advanceMaxDays: rules.advanceMaxDays,
          turnoverNights: rules.turnoverNights,
        },
        update: {
          minNights: rules.minNights,
          maxNights: rules.maxNights,
          checkInDays: rules.checkInDays,
          checkOutDays: rules.checkOutDays,
          advanceMinDays: rules.advanceMinDays,
          advanceMaxDays: rules.advanceMaxDays,
          turnoverNights: rules.turnoverNights,
        },
      });
    });
  }
}
