import { ConflictError } from "@hcp/domain";
import { Hold, type IHoldRepository } from "@hcp/domain";
import { prisma } from "../../client";
import {
  PrismaOutboxRepository,
  saveAggregateWithOutbox,
} from "../OutboxRepository";
import { holdToDomain, isExclusionViolation, stayOverlapsRangeWhere } from "./commerceMappers";
import { persistHoldTx } from "./commercePersistence";

export class PrismaHoldRepository implements IHoldRepository {
  constructor(private readonly outboxRepository: PrismaOutboxRepository) {}

  async save(hold: Hold): Promise<void> {
    const events = hold.pullDomainEvents();

    try {
      await saveAggregateWithOutbox(this.outboxRepository, events, async (tx) => {
        await persistHoldTx(tx, hold);
      });
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictError("Dates no longer available");
      }
      throw error;
    }
  }

  async findById(id: string, tenantId: string): Promise<Hold | null> {
    const record = await prisma.bookingHold.findFirst({
      where: { id, tenantId },
    });
    return record ? holdToDomain(record) : null;
  }

  async findActiveByUnitAndPeriod(
    unitId: string,
    tenantId: string,
    checkIn: string,
    checkOut: string,
  ): Promise<Hold | null> {
    const record = await prisma.bookingHold.findFirst({
      where: {
        tenantId,
        unitId,
        status: "active",
        checkIn: { lt: new Date(`${checkOut}T00:00:00.000Z`) },
        checkOut: { gt: new Date(`${checkIn}T00:00:00.000Z`) },
      },
      orderBy: { createdAt: "desc" },
    });
    return record ? holdToDomain(record) : null;
  }

  async findActiveByUnit(
    unitId: string,
    tenantId: string,
    range?: { from: string; to: string },
  ): Promise<Hold[]> {
    const records = await prisma.bookingHold.findMany({
      where: {
        tenantId,
        unitId,
        status: "active",
        ...(range ? stayOverlapsRangeWhere(range.from, range.to) : {}),
      },
      orderBy: { checkIn: "asc" },
    });
    return records.map(holdToDomain);
  }

  async findActiveByUnits(
    unitIds: string[],
    tenantId: string,
    range?: { from: string; to: string },
  ): Promise<Hold[]> {
    if (unitIds.length === 0) return [];
    const records = await prisma.bookingHold.findMany({
      where: {
        tenantId,
        unitId: { in: unitIds },
        status: "active",
        ...(range ? stayOverlapsRangeWhere(range.from, range.to) : {}),
      },
      orderBy: [{ unitId: "asc" }, { checkIn: "asc" }],
    });
    return records.map(holdToDomain);
  }

  async findActiveByTenant(
    tenantId: string,
    filters?: import("@hcp/domain").HoldListFilters,
  ): Promise<Hold[]> {
    const where: import("@prisma/client").Prisma.BookingHoldWhereInput = {
      tenantId,
      status: "active",
    };

    if (filters?.unitId) {
      where.unitId = filters.unitId;
    }
    if (filters?.propertyId) {
      where.propertyId = filters.propertyId;
    } else if (filters?.allowedPropertyIds && filters.allowedPropertyIds.length > 0) {
      where.propertyId = { in: filters.allowedPropertyIds };
    }

    const records = await prisma.bookingHold.findMany({
      where,
      orderBy: { expiresAt: "asc" },
    });
    return records.map(holdToDomain);
  }

  async findByIdempotencyKey(tenantId: string, idempotencyKey: string): Promise<Hold | null> {
    const record = await prisma.bookingHold.findFirst({
      where: { tenantId, idempotencyKey, status: "active" },
    });
    return record ? holdToDomain(record) : null;
  }

  async findExpiredActive(before: Date, limit: number): Promise<Hold[]> {
    const records = await prisma.bookingHold.findMany({
      where: {
        status: "active",
        expiresAt: { lte: before },
      },
      orderBy: { expiresAt: "asc" },
      take: limit,
    });
    return records.map(holdToDomain);
  }
}

