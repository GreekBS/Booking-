import { ConflictError } from "@hcp/domain";
import { Booking, type BookingSearchFilters, type IBookingRepository } from "@hcp/domain";
import { prisma } from "../../client";
import type { Prisma } from "@prisma/client";
import {
  PrismaOutboxRepository,
  saveAggregateWithOutbox,
} from "../OutboxRepository";
import { bookingToDomain, isExclusionViolation, stayOverlapsRangeWhere } from "./commerceMappers";
import { persistBookingTx } from "./commercePersistence";

export class PrismaBookingRepository implements IBookingRepository {
  constructor(private readonly outboxRepository: PrismaOutboxRepository) {}

  async save(booking: Booking): Promise<void> {
    const events = booking.pullDomainEvents();

    try {
      await saveAggregateWithOutbox(this.outboxRepository, events, async (tx) => {
        await persistBookingTx(tx, booking);
      });
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictError("Dates no longer available");
      }
      throw error;
    }
  }

  async findById(id: string, tenantId: string): Promise<Booking | null> {
    const record = await prisma.booking.findFirst({
      where: { id, tenantId },
    });
    return record ? bookingToDomain(record) : null;
  }

  async findByUnit(
    unitId: string,
    tenantId: string,
    range?: { from: string; to: string },
  ): Promise<Booking[]> {
    const records = await prisma.booking.findMany({
      where: {
        tenantId,
        unitId,
        ...(range ? stayOverlapsRangeWhere(range.from, range.to) : {}),
      },
      orderBy: { checkIn: "asc" },
    });
    return records.map(bookingToDomain);
  }

  async findByUnits(
    unitIds: string[],
    tenantId: string,
    range?: { from: string; to: string },
  ): Promise<Booking[]> {
    if (unitIds.length === 0) return [];
    const records = await prisma.booking.findMany({
      where: {
        tenantId,
        unitId: { in: unitIds },
        ...(range ? stayOverlapsRangeWhere(range.from, range.to) : {}),
      },
      orderBy: [{ unitId: "asc" }, { checkIn: "asc" }],
    });
    return records.map(bookingToDomain);
  }

  async search(filters: BookingSearchFilters) {
    const where: Prisma.BookingWhereInput = {
      tenantId: filters.tenantId,
    };

    if (filters.unitId) {
      where.unitId = filters.unitId;
    }
    if (filters.propertyId) {
      where.propertyId = filters.propertyId;
    } else if (filters.allowedPropertyIds && filters.allowedPropertyIds.length > 0) {
      where.propertyId = { in: filters.allowedPropertyIds };
    }
    if (filters.status) {
      where.status = filters.status as Prisma.EnumBookingStatusFilter["equals"];
    }
    if (filters.checkInFrom || filters.checkInTo) {
      where.checkIn = {
        ...(filters.checkInFrom ? { gte: new Date(`${filters.checkInFrom}T00:00:00.000Z`) } : {}),
        ...(filters.checkInTo ? { lte: new Date(`${filters.checkInTo}T00:00:00.000Z`) } : {}),
      };
    }
    if (filters.checkOutFrom || filters.checkOutTo) {
      where.checkOut = {
        ...(filters.checkOutFrom
          ? { gte: new Date(`${filters.checkOutFrom}T00:00:00.000Z`) }
          : {}),
        ...(filters.checkOutTo ? { lte: new Date(`${filters.checkOutTo}T00:00:00.000Z`) } : {}),
      };
    }
    if (filters.guestSearch) {
      const q = filters.guestSearch.trim();
      where.OR = [
        { guestName: { contains: q, mode: "insensitive" } },
        { guestEmail: { contains: q, mode: "insensitive" } },
      ];
    }

    const orderByField =
      filters.sortBy === "guestName"
        ? "guestName"
        : filters.sortBy === "createdAt"
          ? "createdAt"
          : filters.sortBy;

    const skip = (filters.page - 1) * filters.limit;
    const [records, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: { [orderByField]: filters.sortDir },
      }),
      prisma.booking.count({ where }),
    ]);

    return {
      data: records.map(bookingToDomain),
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }
}

