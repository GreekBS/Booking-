import { ConflictError, type ICalendarBlockRepository } from "@hcp/domain";
import { withTenantTransaction } from "../../client";
import {
  calendarBlockToActive,
  calendarBlockToView,
  isExclusionViolation,
  stayOverlapsRangeWhere,
  toDateColumn,
} from "./commerceMappers";

export class PrismaCalendarBlockRepository implements ICalendarBlockRepository {
  async findActiveBlocks(unitId: string, tenantId: string) {
    return withTenantTransaction(tenantId, async (tx) => {
      const records = await tx.unitCalendarBlock.findMany({
        where: {
          tenantId,
          unitId,
          status: "active",
        },
        orderBy: { checkIn: "asc" },
      });

      return records.map(calendarBlockToActive);
    });
  }

  async findById(id: string, tenantId: string) {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.unitCalendarBlock.findFirst({
        where: { id, tenantId },
      });
      return record ? calendarBlockToView(record) : null;
    });
  }

  async findCalendarBlocks(
    unitId: string,
    tenantId: string,
    range?: { from: string; to: string },
  ) {
    return withTenantTransaction(tenantId, async (tx) => {
      const records = await tx.unitCalendarBlock.findMany({
        where: {
          tenantId,
          unitId,
          ...(range ? stayOverlapsRangeWhere(range.from, range.to) : {}),
        },
        orderBy: { checkIn: "asc" },
      });
      return records.map(calendarBlockToView);
    });
  }

  async findCalendarBlocksByUnits(
    unitIds: string[],
    tenantId: string,
    range?: { from: string; to: string },
  ) {
    if (unitIds.length === 0) return [];
    return withTenantTransaction(tenantId, async (tx) => {
      const records = await tx.unitCalendarBlock.findMany({
        where: {
          tenantId,
          unitId: { in: unitIds },
          ...(range ? stayOverlapsRangeWhere(range.from, range.to) : {}),
        },
        orderBy: [{ unitId: "asc" }, { checkIn: "asc" }],
      });
      return records.map(calendarBlockToView);
    });
  }

  async saveOperatorBlock(params: {
    id: string;
    tenantId: string;
    unitId: string;
    propertyId: string;
    blockType: "manual" | "maintenance" | "cleaning" | "owner";
    checkIn: string;
    checkOut: string;
    reason?: string | null;
  }): Promise<void> {
    try {
      await withTenantTransaction(params.tenantId, async (tx) => {
        await tx.unitCalendarBlock.create({
          data: {
            id: params.id,
            tenantId: params.tenantId,
            unitId: params.unitId,
            propertyId: params.propertyId,
            blockType: params.blockType,
            checkIn: toDateColumn(params.checkIn),
            checkOut: toDateColumn(params.checkOut),
            status: "active",
            reason: params.reason ?? null,
          },
        });
      });
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictError("Dates no longer available");
      }
      throw error;
    }
  }

  async releaseBlock(id: string, tenantId: string): Promise<void> {
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.unitCalendarBlock.updateMany({
        where: {
          id,
          tenantId,
          blockType: { in: ["manual", "maintenance", "cleaning", "owner"] },
        },
        data: { status: "cancelled" },
      });
    });
  }
}
