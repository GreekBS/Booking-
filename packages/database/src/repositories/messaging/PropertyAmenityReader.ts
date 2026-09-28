import type { AssistantContextAmenity } from "@hcp/domain";
import { withTenantTransaction } from "../../client";

/**
 * Loads guest-safe amenities assigned to a Property.
 * Scoped by tenantId + propertyId (property must belong to the tenant).
 */
export class PrismaPropertyAmenityReader {
  async listForProperty(
    tenantId: string,
    propertyId: string,
  ): Promise<AssistantContextAmenity[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const property = await tx.property.findFirst({
        where: { id: propertyId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!property) {
        return [];
      }

      const rows = await tx.propertyAmenity.findMany({
        where: { propertyId },
        include: {
          amenity: {
            select: { id: true, name: true },
          },
        },
      });

      return rows
        .map((row) => ({
          id: row.amenity.id,
          name: row.amenity.name.trim(),
        }))
        .filter((a) => a.name.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
    });
  }
}
