import type { IAvailabilityRulesRepository } from "@hcp/domain";
import { randomUUID } from "node:crypto";
import { prisma, setTenantContext } from "../../client";
import { availabilityRulesToDomain } from "./commerceMappers";

export class PrismaAvailabilityRulesRepository implements IAvailabilityRulesRepository {
  async findByUnitId(unitId: string, tenantId: string) {
    const record = await prisma.unitAvailabilityRule.findFirst({
      where: { unitId, tenantId },
    });

    return record ? availabilityRulesToDomain(record) : null;
  }

  async save(
    tenantId: string,
    unitId: string,
    rules: Parameters<IAvailabilityRulesRepository["save"]>[2],
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, tenantId);

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
