import type { Prisma } from "@prisma/client";
import {
  Hold,
  Quote,
  Booking,
  QuoteSnapshot,
  type HoldProps,
  type HoldStatus,
  type BookingStatus,
  type ConfirmationMode,
  type CalendarBlockType,
  type CalendarBlockStatus,
  type ActiveCalendarBlock,
  type UnitAvailabilityRulesProps,
  type RatePlanProps,
} from "@hcp/domain";
import type {
  BookingHold as PrismaHold,
  Quote as PrismaQuote,
  Booking as PrismaBooking,
  UnitCalendarBlock as PrismaCalendarBlock,
  UnitAvailabilityRule as PrismaAvailabilityRule,
  RatePlan as PrismaRatePlan,
  RateSeason as PrismaRateSeason,
  RateDowModifier as PrismaDowModifier,
} from "@prisma/client";

export function toDateColumn(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Stay period [checkIn, checkOut) overlaps query range [from, to). */
export function stayOverlapsRangeWhere(from: string, to: string) {
  return {
    checkIn: { lt: toDateColumn(to) },
    checkOut: { gt: toDateColumn(from) },
  };
}

export function formatDateColumn(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function decimalToString(value: Prisma.Decimal | string): string {
  return value.toString();
}

export function holdToDomain(record: PrismaHold): Hold {
  return Hold.reconstitute({
    id: record.id,
    tenantId: record.tenantId,
    unitId: record.unitId,
    propertyId: record.propertyId,
    checkIn: formatDateColumn(record.checkIn),
    checkOut: formatDateColumn(record.checkOut),
    guestCount: record.guestCount,
    status: record.status as HoldProps["status"],
    sessionRef: record.idempotencyKey,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export function quoteToDomain(record: PrismaQuote): Quote {
  const raw = record.snapshot as {
    version: number;
    checkIn: string;
    checkOut: string;
    propertyTimezone: string;
    currency: string;
    lineItems: Array<{ date: string; baseAmount: string; adjustedAmount: string; currency: string }>;
    subtotalAmount: string;
    feesAmount: string;
    taxesAmount: string;
    totalAmount: string;
    quotedAt: string;
  };

  return Quote.reconstitute({
    id: record.id,
    tenantId: record.tenantId,
    holdId: record.holdId,
    unitId: record.unitId,
    propertyId: record.propertyId,
    snapshotId: record.snapshotId,
    snapshot: QuoteSnapshot.create({
      version: raw.version,
      checkIn: raw.checkIn,
      checkOut: raw.checkOut,
      propertyTimezone: raw.propertyTimezone,
      currency: raw.currency,
      lineItems: raw.lineItems,
      subtotalAmount: raw.subtotalAmount,
      feesAmount: raw.feesAmount,
      taxesAmount: raw.taxesAmount,
      totalAmount: raw.totalAmount,
      quotedAt: new Date(raw.quotedAt),
    }),
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
  });
}

export function bookingToDomain(record: PrismaBooking): Booking {
  return Booking.reconstitute({
    id: record.id,
    tenantId: record.tenantId,
    unitId: record.unitId,
    propertyId: record.propertyId,
    holdId: record.holdId,
    quoteId: record.quoteId,
    quoteSnapshotId: record.quoteSnapshotId,
    checkIn: formatDateColumn(record.checkIn),
    checkOut: formatDateColumn(record.checkOut),
    guestCount: record.guestCount,
    guest: {
      name: record.guestName,
      email: record.guestEmail,
      phone: record.guestPhone,
    },
    guestId: record.guestId ?? null,
    status: record.status as BookingStatus,
    confirmationMode: record.confirmationMode as ConfirmationMode,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    confirmedAt: record.confirmedAt,
    cancelledAt: record.cancelledAt,
    completedAt: record.completedAt,
  });
}

export function calendarBlockToActive(record: PrismaCalendarBlock): ActiveCalendarBlock {
  return {
    blockType: record.blockType as CalendarBlockType,
    status: record.status as CalendarBlockStatus,
    checkIn: formatDateColumn(record.checkIn),
    checkOut: formatDateColumn(record.checkOut),
    sourceId: record.sourceId,
  };
}

export function calendarBlockToView(record: PrismaCalendarBlock) {
  return {
    id: record.id,
    unitId: record.unitId,
    blockType: record.blockType as CalendarBlockType,
    status: record.status as CalendarBlockStatus,
    checkIn: formatDateColumn(record.checkIn),
    checkOut: formatDateColumn(record.checkOut),
    sourceId: record.sourceId,
    reason: record.reason,
    expiresAt: record.expiresAt?.toISOString() ?? null,
  };
}

export function availabilityRulesToDomain(
  record: PrismaAvailabilityRule,
): UnitAvailabilityRulesProps {
  return {
    minNights: record.minNights,
    maxNights: record.maxNights,
    checkInDays: record.checkInDays,
    checkOutDays: record.checkOutDays,
    advanceMinDays: record.advanceMinDays,
    advanceMaxDays: record.advanceMaxDays,
    turnoverNights: record.turnoverNights,
  };
}

export function ratePlanToDomain(
  plan: PrismaRatePlan,
  seasons: PrismaRateSeason[],
  dowModifiers: PrismaDowModifier[],
): RatePlanProps {
  return {
    baseNightlyAmount: decimalToString(plan.baseNightlyAmount),
    currency: plan.currency.trim(),
    seasons: seasons.map((season) => ({
      id: season.id,
      name: season.name,
      startDate: formatDateColumn(season.startDate),
      endDate: formatDateColumn(season.endDate),
      nightlyAmount: decimalToString(season.nightlyAmount),
    })),
    dowModifiers: dowModifiers.map((modifier) => ({
      dayOfWeek: modifier.dayOfWeek,
      modifierType: modifier.modifierType,
      modifierValue: decimalToString(modifier.modifierValue),
    })),
    losDiscounts: [],
  };
}

export function isExclusionViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const message = String(
    (error as { message?: string }).message ??
      (error as { cause?: { message?: string } }).cause?.message ??
      "",
  );

  return (
    message.includes("unit_calendar_no_overlap") ||
    message.includes("exclusion constraint") ||
    message.includes("23P01")
  );
}

export function mapCalendarBlockStatusForHold(status: HoldStatus): CalendarBlockStatus {
  switch (status) {
    case "active":
      return "active";
    case "released":
      return "released";
    case "expired":
      return "expired";
    case "converted":
      return "released";
  }
}

export function mapCalendarBlockStatusForBooking(status: BookingStatus): CalendarBlockStatus {
  switch (status) {
    case "cancelled":
      return "cancelled";
    case "completed":
    case "confirmed":
    case "payment_pending":
    case "pending":
      return "active";
  }
}
