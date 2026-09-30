import type {
  DirectBookingCatalogSnapshot,
  IDirectBookingCatalogPort,
} from "@hcp/domain";
import { withTenantTransaction } from "../client";

export class PrismaDirectBookingCatalogAdapter implements IDirectBookingCatalogPort {
  async getCatalogSnapshot(
    tenantId: string,
    propertyId: string,
    unitId: string,
  ): Promise<DirectBookingCatalogSnapshot | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const property = await tx.property.findFirst({
        where: { id: propertyId, tenantId },
        select: {
          id: true,
          tenantId: true,
          name: true,
          slug: true,
          type: true,
          status: true,
          timezone: true,
          deletedAt: true,
        },
      });

      if (!property) {
        return null;
      }

      const unit = await tx.unit.findFirst({
        where: { id: unitId, tenantId, propertyId },
        select: {
          id: true,
          propertyId: true,
          name: true,
          slug: true,
          status: true,
          maxGuests: true,
          bedrooms: true,
          bathrooms: true,
          deletedAt: true,
        },
      });

      if (!unit) {
        return null;
      }

      const [commerce, ratePlan, rules] = await Promise.all([
        tx.tenantCommerceSettings.findUnique({
          where: { tenantId },
          select: { defaultCurrency: true },
        }),
        tx.ratePlan.findFirst({
          where: { tenantId, unitId },
          select: { id: true, currency: true },
        }),
        tx.unitAvailabilityRule.findUnique({
          where: { unitId },
          select: {
            minNights: true,
            maxNights: true,
            checkInDays: true,
            checkOutDays: true,
            advanceMinDays: true,
            advanceMaxDays: true,
            turnoverNights: true,
          },
        }),
      ]);

      return {
        property,
        unit,
        currency: ratePlan?.currency ?? commerce?.defaultCurrency ?? "EUR",
        hasRatePlan: ratePlan !== null,
        stayRules: rules
          ? {
              minNights: rules.minNights,
              maxNights: rules.maxNights,
              checkInDays: rules.checkInDays,
              checkOutDays: rules.checkOutDays,
              advanceMinDays: rules.advanceMinDays,
              advanceMaxDays: rules.advanceMaxDays,
              turnoverNights: rules.turnoverNights,
            }
          : null,
      };
    });
  }
}
