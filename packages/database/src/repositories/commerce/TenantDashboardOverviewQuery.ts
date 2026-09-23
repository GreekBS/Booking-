import type {
  ITenantDashboardOverviewQuery,
  TenantDashboardOverviewReadModel,
} from "@hcp/domain";
import { prisma } from "../../client";

function formatDateColumn(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function propertyScopeWhere(allowedPropertyIds: string[] | null) {
  if (allowedPropertyIds === null) return {};
  if (allowedPropertyIds.length === 0) {
    return { propertyId: { in: [] as string[] } };
  }
  return { propertyId: { in: allowedPropertyIds } };
}

function propertyIdScopeWhere(allowedPropertyIds: string[] | null) {
  if (allowedPropertyIds === null) return {};
  if (allowedPropertyIds.length === 0) {
    return { id: { in: [] as string[] } };
  }
  return { id: { in: allowedPropertyIds } };
}

/**
 * Efficient dashboard aggregates via Prisma count/groupBy/sum.
 * Never loads Quote rows or performs per-booking quote lookups.
 */
export class PrismaTenantDashboardOverviewQuery
  implements ITenantDashboardOverviewQuery
{
  async getOverview(input: {
    tenantId: string;
    allowedPropertyIds: string[] | null;
    todayIso: string;
    arrivalsThroughIso: string;
    occupancyThroughIso: string;
    recentLimit: number;
  }): Promise<TenantDashboardOverviewReadModel> {
    const bookingScope = propertyScopeWhere(input.allowedPropertyIds);
    const propertyScope = propertyIdScopeWhere(input.allowedPropertyIds);
    const today = new Date(`${input.todayIso}T00:00:00.000Z`);
    const arrivalsThrough = new Date(`${input.arrivalsThroughIso}T00:00:00.000Z`);
    const occupancyThrough = new Date(`${input.occupancyThroughIso}T00:00:00.000Z`);

    const nonCancelled = {
      tenantId: input.tenantId,
      ...bookingScope,
      status: { not: "cancelled" as const },
    };

    const [
      propertyCount,
      unitCount,
      bookingCount,
      arrivalsNext7Days,
      departuresNext7Days,
      activeHoldCount,
      revenueAgg,
      currencyRow,
      recentRecords,
      occupancyBookings,
    ] = await Promise.all([
      prisma.property.count({
        where: {
          tenantId: input.tenantId,
          deletedAt: null,
          ...propertyScope,
        },
      }),
      prisma.unit.count({
        where: {
          tenantId: input.tenantId,
          deletedAt: null,
          ...(input.allowedPropertyIds === null
            ? {}
            : input.allowedPropertyIds.length === 0
              ? { propertyId: { in: [] } }
              : { propertyId: { in: input.allowedPropertyIds } }),
        },
      }),
      prisma.booking.count({ where: nonCancelled }),
      prisma.booking.count({
        where: {
          ...nonCancelled,
          checkIn: { gte: today, lte: arrivalsThrough },
        },
      }),
      prisma.booking.count({
        where: {
          ...nonCancelled,
          checkOut: { gte: today, lte: arrivalsThrough },
        },
      }),
      prisma.bookingHold.count({
        where: {
          tenantId: input.tenantId,
          status: "active",
          ...bookingScope,
        },
      }),
      prisma.booking.aggregate({
        where: {
          tenantId: input.tenantId,
          ...bookingScope,
          status: { in: ["confirmed", "completed"] },
        },
        _sum: { totalAmount: true },
        _count: { _all: true },
      }),
      prisma.booking.findFirst({
        where: {
          tenantId: input.tenantId,
          ...bookingScope,
          status: { in: ["confirmed", "completed"] },
        },
        select: { currency: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.booking.findMany({
        where: nonCancelled,
        orderBy: { createdAt: "desc" },
        take: input.recentLimit,
        select: {
          id: true,
          guestName: true,
          checkIn: true,
          checkOut: true,
          status: true,
          totalAmount: true,
          currency: true,
        },
      }),
      prisma.booking.findMany({
        where: {
          ...nonCancelled,
          checkIn: { lt: occupancyThrough },
          checkOut: { gt: today },
        },
        select: {
          checkIn: true,
          checkOut: true,
        },
      }),
    ]);

    let revenue: TenantDashboardOverviewReadModel["revenue"] = null;
    if (revenueAgg._count._all > 0) {
      revenue = {
        total: (revenueAgg._sum.totalAmount ?? 0).toString(),
        currency: currencyRow?.currency ?? "EUR",
      };
    }

    // Same occupancy estimate as prior client: booked nights in next 30d / (units * 30)
    let bookedNights = 0;
    for (const b of occupancyBookings) {
      const checkIn = formatDateColumn(b.checkIn);
      const checkOut = formatDateColumn(b.checkOut);
      if (checkOut <= input.todayIso || checkIn >= input.occupancyThroughIso) continue;
      const start = checkIn > input.todayIso ? checkIn : input.todayIso;
      bookedNights += Math.max(
        1,
        Math.round(
          (new Date(`${checkOut}T00:00:00.000Z`).getTime() -
            new Date(`${start}T00:00:00.000Z`).getTime()) /
            86_400_000,
        ),
      );
    }
    const capacityNights = unitCount * 30;
    const occupancyPct =
      capacityNights > 0
        ? Math.min(100, Math.round((bookedNights / capacityNights) * 100))
        : 0;

    return {
      propertyCount,
      unitCount,
      bookingCount,
      arrivalsNext7Days,
      departuresNext7Days,
      activeHoldCount,
      revenue,
      occupancyPct,
      recentBookings: recentRecords.map((r) => ({
        id: r.id,
        guestName: r.guestName,
        checkIn: formatDateColumn(r.checkIn),
        checkOut: formatDateColumn(r.checkOut),
        status: r.status,
        totalAmount: r.totalAmount.toString(),
        currency: r.currency,
      })),
    };
  }
}
