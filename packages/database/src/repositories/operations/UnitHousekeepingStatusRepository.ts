import {
  ConflictError,
  UnitHousekeepingStatus,
  type IUnitHousekeepingStatusRepository,
  type UnitHousekeepingSource,
  type UnitHousekeepingStatusValue,
} from "@hcp/domain";
import { withTenantTransaction } from "../../client";

type HkRow = {
  unitId: string;
  tenantId: string;
  propertyId: string;
  status: string;
  source: string;
  updatedByUserId: string | null;
  updatedAt: Date;
  version: number;
};

function mapHk(row: HkRow): UnitHousekeepingStatus {
  return UnitHousekeepingStatus.reconstitute({
    unitId: row.unitId,
    tenantId: row.tenantId,
    propertyId: row.propertyId,
    status: row.status as UnitHousekeepingStatusValue,
    source: row.source as UnitHousekeepingSource,
    updatedByUserId: row.updatedByUserId,
    updatedAt: row.updatedAt,
    version: row.version,
  });
}

export class PrismaUnitHousekeepingStatusRepository
  implements IUnitHousekeepingStatusRepository
{
  async save(status: UnitHousekeepingStatus): Promise<void> {
    const p = status.toProps();
    await withTenantTransaction(status.tenantId, async (tx) => {
      await tx.unitHousekeepingStatus.upsert({
        where: { unitId: status.unitId },
        create: {
          unitId: p.unitId,
          tenantId: p.tenantId,
          propertyId: p.propertyId,
          status: p.status,
          source: p.source,
          updatedByUserId: p.updatedByUserId,
          updatedAt: p.updatedAt,
          version: p.version,
        },
        update: {
          propertyId: p.propertyId,
          status: p.status,
          source: p.source,
          updatedByUserId: p.updatedByUserId,
          updatedAt: p.updatedAt,
          version: p.version,
        },
      });
    });
  }

  async saveWithExpectedVersion(
    status: UnitHousekeepingStatus,
    expectedVersion: number,
  ): Promise<void> {
    const p = status.toProps();
    await withTenantTransaction(status.tenantId, async (tx) => {
      const result = await tx.unitHousekeepingStatus.updateMany({
        where: {
          unitId: status.unitId,
          tenantId: status.tenantId,
          version: expectedVersion,
        },
        data: {
          propertyId: p.propertyId,
          status: p.status,
          source: p.source,
          updatedByUserId: p.updatedByUserId,
          updatedAt: p.updatedAt,
          version: p.version,
        },
      });
      if (result.count !== 1) {
        throw new ConflictError(
          "Unit housekeeping version conflict",
          "housekeeping_version_conflict",
        );
      }
    });
  }

  async findByUnitId(
    tenantId: string,
    unitId: string,
  ): Promise<UnitHousekeepingStatus | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.unitHousekeepingStatus.findFirst({
        where: { tenantId, unitId },
      });
      return row ? mapHk(row as HkRow) : null;
    });
  }

  async ensureInitialized(input: {
    tenantId: string;
    propertyId: string;
    unitId: string;
  }): Promise<UnitHousekeepingStatus> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const existing = await tx.unitHousekeepingStatus.findFirst({
        where: { tenantId: input.tenantId, unitId: input.unitId },
      });
      if (existing) {
        return mapHk(existing as HkRow);
      }
      const now = new Date();
      try {
        const created = await tx.unitHousekeepingStatus.create({
          data: {
            unitId: input.unitId,
            tenantId: input.tenantId,
            propertyId: input.propertyId,
            status: "CLEAN",
            source: "INIT",
            updatedByUserId: null,
            updatedAt: now,
            version: 1,
          },
        });
        return mapHk(created as HkRow);
      } catch {
        const again = await tx.unitHousekeepingStatus.findFirst({
          where: { tenantId: input.tenantId, unitId: input.unitId },
        });
        if (!again) throw new Error("Failed to initialize unit housekeeping status");
        return mapHk(again as HkRow);
      }
    });
  }

  async listByProperty(input: {
    tenantId: string;
    propertyId: string;
    status?: UnitHousekeepingStatusValue;
  }): Promise<UnitHousekeepingStatus[]> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const rows = await tx.unitHousekeepingStatus.findMany({
        where: {
          tenantId: input.tenantId,
          propertyId: input.propertyId,
          ...(input.status ? { status: input.status } : {}),
        },
        orderBy: { updatedAt: "desc" },
      });
      return rows.map((r) => mapHk(r as HkRow));
    });
  }
}

export { mapHk, type HkRow };
