import { Hold } from "../../../src/commerce/booking/domain/Hold";
import { Quote } from "../../../src/commerce/booking/domain/Quote";
import { Booking } from "../../../src/commerce/booking/domain/Booking";
import { AvailabilityEvaluator } from "../../../src/commerce/availability/AvailabilityEvaluator";
import { PricingCalculator } from "../../../src/commerce/pricing/PricingCalculator";
import { StayPeriod } from "../../../src/commerce/shared/value-objects/StayPeriod";
import { LocalDate } from "../../../src/commerce/shared/value-objects/LocalDate";
import { GuestCount } from "../../../src/commerce/shared/value-objects/GuestCount";
import type {
  ActiveCalendarBlock,
  RatePlanProps,
  UnitAvailabilityRulesProps,
} from "../../../src/commerce/shared/types/CommerceTypes";

export const TENANT_ID = "tenant-fixture-1";
export const QUOTED_AT = new Date("2025-06-01T12:00:00.000Z");
export const HOLD_CREATED_AT = new Date("2025-06-01T10:00:00.000Z");
export const HOLD_EXPIRED_AT = new Date("2025-06-01T10:20:00.000Z");

export const villaProperty = {
  id: "prop-villa-1",
  tenantId: TENANT_ID,
  name: "Aegean Villa",
  timezone: "Europe/Athens",
  units: [
    {
      id: "unit-villa-entire",
      name: "Entire Property",
      maxGuests: 6,
    },
  ],
};

export const hotelProperty = {
  id: "prop-hotel-1",
  tenantId: TENANT_ID,
  name: "City Hotel",
  timezone: "Europe/Athens",
  units: [
    { id: "unit-hotel-101", name: "Room 101", maxGuests: 2 },
    { id: "unit-hotel-102", name: "Room 102", maxGuests: 2 },
    { id: "unit-hotel-suite", name: "Suite 201", maxGuests: 4 },
  ],
};

export const defaultAvailabilityRules: UnitAvailabilityRulesProps = {
  minNights: 2,
  maxNights: 14,
  checkInDays: [],
  checkOutDays: [],
  advanceMinDays: 1,
  advanceMaxDays: 365,
  turnoverNights: 0,
};

export const baseRatePlan: RatePlanProps = {
  baseNightlyAmount: "100.0000",
  currency: "EUR",
  seasons: [],
  dowModifiers: [],
  losDiscounts: [],
};

export const highSeasonRatePlan: RatePlanProps = {
  ...baseRatePlan,
  seasons: [
    {
      id: "season-peak",
      name: "High Season",
      startDate: "2025-07-01",
      endDate: "2025-08-31",
      nightlyAmount: "180.0000",
    },
  ],
};

export const weekendModifierRatePlan: RatePlanProps = {
  ...baseRatePlan,
  dowModifiers: [
    { dayOfWeek: 5, modifierType: "percent", modifierValue: "20.0000" },
    { dayOfWeek: 6, modifierType: "fixed", modifierValue: "30.0000" },
  ],
  losDiscounts: [{ minNights: 7, percentOff: "10.0000" }],
};

export const blockedDates: ActiveCalendarBlock[] = [
  {
    blockType: "manual",
    status: "active",
    checkIn: "2025-08-10",
    checkOut: "2025-08-15",
    sourceId: null,
  },
];

export function createHoldForUnit(
  unitId: string,
  propertyId: string,
  checkIn: string,
  checkOut: string,
  options: {
    holdId?: string;
    guestCount?: number;
    now?: Date;
    ttlSeconds?: number;
  } = {},
): Hold {
  return Hold.create({
    id: options.holdId ?? `hold-${unitId}`,
    tenantId: TENANT_ID,
    unitId,
    propertyId,
    checkIn,
    checkOut,
    guestCount: options.guestCount ?? 2,
    now: options.now ?? HOLD_CREATED_AT,
    ttlSeconds: options.ttlSeconds,
  });
}

export function createExpiredHold(): Hold {
  const hold = createHoldForUnit(
    villaProperty.units[0].id,
    villaProperty.id,
    "2025-08-01",
    "2025-08-04",
    { holdId: "hold-expired", now: HOLD_CREATED_AT },
  );
  hold.expire(HOLD_EXPIRED_AT);
  return hold;
}

export function createQuoteForHold(
  hold: Hold,
  ratePlan: RatePlanProps = baseRatePlan,
  now: Date = new Date(HOLD_CREATED_AT.getTime() + 5 * 60_000),
): Quote {
  const pricing = new PricingCalculator().calculate(
    ratePlan,
    hold.stayPeriod,
    now,
  );
  return Quote.create({
    id: `quote-${hold.id}`,
    snapshotId: `snapshot-${hold.id}`,
    hold,
    pricing,
    propertyTimezone: villaProperty.timezone,
  });
}

export function createPaymentPendingBooking(): Booking {
  const hold = createHoldForUnit(
    hotelProperty.units[0].id,
    hotelProperty.id,
    "2025-09-01",
    "2025-09-04",
    { holdId: "hold-payment-pending" },
  );
  const quote = createQuoteForHold(hold);
  const now = new Date(HOLD_CREATED_AT.getTime() + 5 * 60_000);
  return Booking.create({
    id: "booking-payment-pending",
    hold,
    quote,
    guest: {
      name: "Alex Guest",
      email: "alex@example.com",
      phone: "+30 210 0000000",
    },
    confirmationMode: "payment_required",
    now,
  });
}

export function evaluateAvailability(
  unitMaxGuests: number,
  checkIn: string,
  checkOut: string,
  rules: UnitAvailabilityRulesProps = defaultAvailabilityRules,
  blocks: ActiveCalendarBlock[] = [],
  today = "2025-06-01",
) {
  return new AvailabilityEvaluator().evaluate({
    stayPeriod: StayPeriod.create(checkIn, checkOut),
    guestCount: GuestCount.create(2),
    unitMaxGuests,
    rules,
    activeBlocks: blocks,
    propertyLocalToday: LocalDate.create(today),
  });
}
