import type { IRatePlanRepository, RatePlanProps } from "@hcp/domain";
import { randomUUID } from "node:crypto";
import { prisma, setTenantContext } from "../../client";
import { ratePlanToDomain } from "./commerceMappers";

export class PrismaRatePlanRepository implements IRatePlanRepository {
  async findByUnitId(unitId: string, tenantId: string) {
    const plan = await prisma.ratePlan.findFirst({
      where: { unitId, tenantId },
      include: {
        seasons: true,
        dowModifiers: true,
      },
    });

    if (!plan) {
      return null;
    }

    return ratePlanToDomain(plan, plan.seasons, plan.dowModifiers);
  }

  async save(tenantId: string, unitId: string, plan: RatePlanProps): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, tenantId);

      const existing = await tx.ratePlan.findFirst({
        where: { unitId, tenantId },
      });

      const ratePlanId = existing?.id ?? randomUUID();

      await tx.ratePlan.upsert({
        where: { unitId },
        create: {
          id: ratePlanId,
          tenantId,
          unitId,
          baseNightlyAmount: plan.baseNightlyAmount,
          currency: plan.currency,
        },
        update: {
          baseNightlyAmount: plan.baseNightlyAmount,
          currency: plan.currency,
        },
      });

      await tx.rateSeason.deleteMany({ where: { ratePlanId } });
      await tx.rateDowModifier.deleteMany({ where: { ratePlanId } });

      if (plan.seasons.length > 0) {
        await tx.rateSeason.createMany({
          data: plan.seasons.map((season) => ({
            id: season.id ?? randomUUID(),
            tenantId,
            ratePlanId,
            name: season.name,
            startDate: new Date(`${season.startDate}T00:00:00.000Z`),
            endDate: new Date(`${season.endDate}T00:00:00.000Z`),
            nightlyAmount: season.nightlyAmount,
          })),
        });
      }

      if (plan.dowModifiers.length > 0) {
        await tx.rateDowModifier.createMany({
          data: plan.dowModifiers.map((modifier) => ({
            id: randomUUID(),
            tenantId,
            ratePlanId,
            dayOfWeek: modifier.dayOfWeek,
            modifierType: modifier.modifierType,
            modifierValue: modifier.modifierValue,
          })),
        });
      }
    });
  }
}
