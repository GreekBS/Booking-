import type {
  CatalogPropertyReadModel,
  CatalogUnitReadModel,
  ICatalogQueryPort,
} from "@hcp/domain";
import { withTenantTransaction } from "../client";

export class PrismaCatalogQueryAdapter implements ICatalogQueryPort {
  async getUnit(unitId: string, tenantId: string): Promise<CatalogUnitReadModel | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const unit = await tx.unit.findFirst({
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
    });
  }

  async getProperty(
    propertyId: string,
    tenantId: string,
  ): Promise<CatalogPropertyReadModel | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const property = await tx.property.findFirst({
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
    });
  }

  async getUnitsByIds(
    unitIds: string[],
    tenantId: string,
  ): Promise<CatalogUnitReadModel[]> {
    if (unitIds.length === 0) return [];
    return withTenantTransaction(tenantId, async (tx) => {
      const units = await tx.unit.findMany({
        where: { tenantId, id: { in: unitIds } },
        select: {
          id: true,
          tenantId: true,
          propertyId: true,
          maxGuests: true,
          status: true,
        },
      });
      return units.map((unit) => ({
        id: unit.id,
        tenantId: unit.tenantId,
        propertyId: unit.propertyId,
        maxGuests: unit.maxGuests,
        status: unit.status,
      }));
    });
  }

  async getPropertiesByIds(
    propertyIds: string[],
    tenantId: string,
  ): Promise<CatalogPropertyReadModel[]> {
    if (propertyIds.length === 0) return [];
    return withTenantTransaction(tenantId, async (tx) => {
      const properties = await tx.property.findMany({
        where: { tenantId, id: { in: propertyIds } },
        select: {
          id: true,
          tenantId: true,
          timezone: true,
          status: true,
        },
      });
      return properties.map((property) => ({
        id: property.id,
        tenantId: property.tenantId,
        timezone: property.timezone,
        status: property.status,
      }));
    });
  }

  async getUnitPropertyContextsByUnitIds(
    unitIds: string[],
    tenantId: string,
  ): Promise<Array<{ unitId: string; propertyId: string }>> {
    if (unitIds.length === 0) return [];
    return withTenantTransaction(tenantId, async (tx) => {
      const units = await tx.unit.findMany({
        where: { tenantId, id: { in: unitIds } },
        select: {
          id: true,
          propertyId: true,
          property: {
            select: {
              id: true,
              tenantId: true,
            },
          },
        },
      });

      const contexts: Array<{ unitId: string; propertyId: string }> = [];
      for (const unit of units) {
        // Tenant isolation: unit already scoped; property must match same tenant.
        if (!unit.property || unit.property.tenantId !== tenantId) {
          continue;
        }
        contexts.push({ unitId: unit.id, propertyId: unit.propertyId });
      }
      return contexts;
    });
  }
}
