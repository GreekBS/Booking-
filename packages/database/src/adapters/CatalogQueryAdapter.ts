import type {
  CatalogPropertyReadModel,
  CatalogUnitReadModel,
  ICatalogQueryPort,
} from "@hcp/domain";
import { prisma } from "../client";

export class PrismaCatalogQueryAdapter implements ICatalogQueryPort {
  async getUnit(unitId: string, tenantId: string): Promise<CatalogUnitReadModel | null> {
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, tenantId },
      select: {
        id: true,
        tenantId: true,
        propertyId: true,
        maxGuests: true,
        status: true,
      },
    });

    if (!unit) {
      return null;
    }

    return {
      id: unit.id,
      tenantId: unit.tenantId,
      propertyId: unit.propertyId,
      maxGuests: unit.maxGuests,
      status: unit.status,
    };
  }

  async getProperty(
    propertyId: string,
    tenantId: string,
  ): Promise<CatalogPropertyReadModel | null> {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, tenantId },
      select: {
        id: true,
        tenantId: true,
        timezone: true,
        status: true,
      },
    });

    if (!property) {
      return null;
    }

    return {
      id: property.id,
      tenantId: property.tenantId,
      timezone: property.timezone,
      status: property.status,
    };
  }
}
