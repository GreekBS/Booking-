import type { IStorefrontCatalogPort, PublicPropertyReadModel } from "@hcp/domain";
import { prisma } from "../client";

export class PrismaStorefrontCatalogAdapter implements IStorefrontCatalogPort {
  async getPublishedPropertyBySlug(
    tenantId: string,
    slug: string,
  ): Promise<PublicPropertyReadModel | null> {
    const property = await prisma.property.findFirst({
      where: {
        tenantId,
        slug,
        status: "active",
        deletedAt: null,
      },
      include: {
        units: {
          where: { status: "active", deletedAt: null },
          orderBy: { name: "asc" },
        },
      },
    });

    if (!property) {
      return null;
    }

    return {
      id: property.id,
      slug: property.slug,
      name: property.name,
      type: property.type,
      timezone: property.timezone,
      city: property.city,
      country: property.country,
      units: property.units.map((unit) => ({
        id: unit.id,
        slug: unit.slug,
        name: unit.name,
        maxGuests: unit.maxGuests,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
      })),
    };
  }

  async isPublishedUnit(tenantId: string, unitId: string): Promise<boolean> {
    const unit = await prisma.unit.findFirst({
      where: {
        id: unitId,
        tenantId,
        status: "active",
        deletedAt: null,
        property: {
          status: "active",
          deletedAt: null,
        },
      },
    });
    return unit !== null;
  }
}
