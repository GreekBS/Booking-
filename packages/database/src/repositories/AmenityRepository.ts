import type {
  AmenityRecord,
  IAmenityRepository,
} from "@hcp/domain";
import { prisma } from "../client";

export class PrismaAmenityRepository implements IAmenityRepository {
  async findAll(tenantId: string): Promise<AmenityRecord[]> {
    const records = await prisma.amenity.findMany({
      where: {
        OR: [{ tenantId: null }, { tenantId }],
      },
      orderBy: { name: "asc" },
    });

    return records.map((record) => ({
      id: record.id,
      tenantId: record.tenantId,
      name: record.name,
      icon: record.icon,
      category: record.category,
    }));
  }

  async saveCustom(
    tenantId: string,
    name: string,
    icon?: string,
    category?: string,
  ): Promise<AmenityRecord> {
    const record = await prisma.amenity.create({
      data: {
        tenantId,
        name: name.trim(),
        icon: icon ?? null,
        category: category ?? null,
      },
    });

    return {
      id: record.id,
      tenantId: record.tenantId,
      name: record.name,
      icon: record.icon,
      category: record.category,
    };
  }
}
