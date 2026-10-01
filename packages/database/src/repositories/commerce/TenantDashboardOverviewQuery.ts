import type {
  ITenantDashboardOverviewQuery,
  TenantDashboardOverviewReadModel,
  DashboardRecentBookingReadModel,
} from "@hcp/domain";
import {
  occupiedNightsInPeriod,
  periodDayCount,
  prorateStayRevenue,
} from "@hcp/domain";
import { withTenantTransaction } from "../../client";

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

type BookingListRow = {
  id: string;
  guestName: string;
  checkIn: Date;
  checkOut: Date;
  status: string;
  totalAmount: { toString(): string };
  currency: string;
  unit: { name: string } | null;
};

function mapBookingRow(r: BookingListRow): DashboardRecentBookingReadModel {
  return {
    id: r.id,
    guestName: r.guestName,
    checkIn: formatDateColumn(r.checkIn),
    checkOut: formatDateColumn(r.checkOut),
    status: r.status,
    totalAmount: r.totalAmount.toString(),
    currency: r.currency,
    unitName: r.unit?.name ?? null,
  };
}

const bookingListSelect = {
  id: true,
  guestName: true,
  checkIn: true,
  checkOut: true,
  status: true,
  totalAmount: true,
  currency: true,
  unit: { select: { name: true } },
} as const;

function formatMoney4(n: number): string {
  return n.toFixed(4);
}

/**
 * Efficient dashboard aggregates via Prisma count/groupBy/sum.
 * Never loads Quote rows or performs per-booking quote lookups.
 *
 * Analytics status policy (locked): confirmed + completed only
 * for revenue, booking count, occupied nights, occupancy, ADR.
 * Operational today widgets continue to use non-cancelled.
 */
export class PrismaTenantDashboardOverviewQuery
  implements ITenantDashboardOverviewQuery
{
  async getOverview(input: {
    tenantId: string;
    allowedPropertyIds: string[] | null;
    todayIso: string;
    arrivalsThroughIso: string;
    period: import("@hcp/domain").AnalyticsPeriodWindow;
    recentLimit: number;
    propertyTimezone: string;
  }): Promise<TenantDashboardOverviewReadModel> {
    return withTenantTransaction(input.tenantId, async (tx) => {
      const bookingScope = propertyScopeWhere(input.allowedPropertyIds);
      const propertyScope = propertyIdScopeWhere(input.allowedPropertyIds);
      const today = new Date(`${input.todayIso}T00:00:00.000Z`);
      const todayEnd = new Date(`${input.todayIso}T23:59:59.999Z`);
      const arrivalsThrough = new Date(
        `${input.arrivalsThroughIso}T00:00:00.000Z`,
      );
      const periodStart = new Date(`${input.period.startDate}T00:00:00.000Z`);
      const periodEndExclusive = new Date(
        `${input.period.endDateExclusive}T00:00:00.000Z`,
      );
      const todayListLimit = Math.min(8, input.recentLimit);

      const nonCancelled = {
        tenantId: input.tenantId,
        ...bookingScope,
        status: { not: "cancelled" as const },
      };

      const analyticsStatuses = {
        tenantId: input.tenantId,
        ...bookingScope,
        status: { in: ["confirmed", "completed"] as Array<"confirmed" | "completed"> },
      };

      const [
        propertyCount,
        unitCount,
        arrivalsNext7Days,
        departuresNext7Days,
        arrivalsToday,
        departuresToday,
        inHouseToday,
        activeHoldCount,
        recentRecords,
        todayArrivalRecords,
        todayDepartureRecords,
        periodBookings,
        currencyRow,
      ] = await Promise.all([
        tx.property.count({
          where: {
            tenantId: input.tenantId,
            deletedAt: null,
            ...propertyScope,
          },
        }),
        tx.unit.count({
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
        tx.booking.count({
          where: {
            ...nonCancelled,
            checkIn: { gte: today, lte: arrivalsThrough },
          },
        }),
        tx.booking.count({
          where: {
            ...nonCancelled,
            checkOut: { gte: today, lte: arrivalsThrough },
          },
        }),
        tx.booking.count({
          where: {
            ...nonCancelled,
            checkIn: { gte: today, lte: todayEnd },
          },
        }),
        tx.booking.count({
          where: {
            ...nonCancelled,
            checkOut: { gte: today, lte: todayEnd },
          },
        }),
        tx.booking.count({
          where: {
            ...nonCancelled,
            checkIn: { lte: todayEnd },
            checkOut: { gt: today },
          },
        }),
        tx.bookingHold.count({
          where: {
            tenantId: input.tenantId,
            status: "active",
            ...bookingScope,
          },
        }),
        tx.booking.findMany({
          where: nonCancelled,
          orderBy: { createdAt: "desc" },
          take: input.recentLimit,
          select: bookingListSelect,
        }),
        tx.booking.findMany({
          where: {
            ...nonCancelled,
            checkIn: { gte: today, lte: todayEnd },
          },
          orderBy: { checkIn: "asc" },
          take: todayListLimit,
          select: bookingListSelect,
        }),
        tx.booking.findMany({
          where: {
            ...nonCancelled,
            checkOut: { gte: today, lte: todayEnd },
          },
          orderBy: { checkOut: "asc" },
          take: todayListLimit,
          select: bookingListSelect,
        }),
        // Period-overlapping confirmed/completed stays only (bounded by period).
        tx.booking.findMany({
          where: {
            ...analyticsStatuses,
            checkIn: { lt: periodEndExclusive },
            checkOut: { gt: periodStart },
          },
          select: {
            checkIn: true,
            checkOut: true,
            totalAmount: true,
            currency: true,
          },
        }),
        tx.booking.findFirst({
          where: analyticsStatuses,
          select: { currency: true },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      let occupiedNights = 0;
      let revenueTotal = 0;
      let bookingCount = 0;
      for (const b of periodBookings) {
        const checkIn = formatDateColumn(b.checkIn);
        const checkOut = formatDateColumn(b.checkOut);
        const nights = occupiedNightsInPeriod(
          checkIn,
          checkOut,
          input.period.startDate,
          input.period.endDateExclusive,
        );
        if (nights <= 0) continue;
        bookingCount += 1;
        occupiedNights += nights;
        revenueTotal += prorateStayRevenue(
          b.totalAmount.toString(),
          checkIn,
          checkOut,
          input.period.startDate,
          input.period.endDateExclusive,
        );
      }

      const currency = currencyRow?.currency ?? "EUR";
      const periodDays = periodDayCount(
        input.period.startDate,
        input.period.endDateExclusive,
      );
      const capacityNights = unitCount * periodDays;
      const occupancyPct =
        capacityNights > 0
          ? Math.min(100, Math.round((occupiedNights / capacityNights) * 100))
          : 0;

      const revenue =
        bookingCount > 0
          ? { total: formatMoney4(revenueTotal), currency }
          : null;

      const adr =
        occupiedNights > 0
          ? {
              amount: formatMoney4(revenueTotal / occupiedNights),
              currency,
            }
          : null;

      const periodAnalytics = {
        period: input.period,
        revenue,
        bookingCount,
        occupiedNights,
        occupancyPct,
        adr,
        capacityNights,
      };

      return {
        propertyCount,
        unitCount,
        bookingCount,
        arrivalsNext7Days,
        departuresNext7Days,
        arrivalsToday,
        departuresToday,
        inHouseToday,
        activeHoldCount,
        revenue,
        occupancyPct,
        periodAnalytics,
        localToday: input.todayIso,
        propertyTimezone: input.propertyTimezone,
        recentBookings: recentRecords.map(mapBookingRow),
        todayArrivals: todayArrivalRecords.map(mapBookingRow),
        todayDepartures: todayDepartureRecords.map(mapBookingRow),
      };
    });
  }
}
