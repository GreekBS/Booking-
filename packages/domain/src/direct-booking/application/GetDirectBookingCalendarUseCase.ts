import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, NotFoundError, ValidationError } from "../../shared/errors/DomainError";
import { LocalDate } from "../../commerce/shared/value-objects/LocalDate";
import { StayPeriod } from "../../commerce/shared/value-objects/StayPeriod";
import { PricingCalculator } from "../../commerce/pricing/PricingCalculator";
import type {
  ActiveCalendarBlock,
  RatePlanProps,
  UnitAvailabilityRulesProps,
} from "../../commerce/shared/types/CommerceTypes";
import type {
  IAvailabilityRulesRepository,
  ICalendarBlockRepository,
  IRatePlanRepository,
  ITimezoneService,
} from "../../commerce/ports/CommercePorts";
import type {
  DirectBookingIntegrationPublicLookup,
  IDirectBookingCatalogPort,
} from "../ports/DirectBookingPorts";
import {
  assertDirectBookingBookable,
  assertIntegrationEnabledForPublicAccess,
  evaluateDirectBookingPublishability,
} from "./publishability";

/** Public calendar browsing cap: [from, to) span in days (exclusive end). */
export const DIRECT_BOOKING_CALENDAR_MAX_RANGE_DAYS = 93;

const DEFAULT_RULES: UnitAvailabilityRulesProps = {
  minNights: 1,
  maxNights: 30,
  checkInDays: [0, 1, 2, 3, 4, 5, 6],
  checkOutDays: [0, 1, 2, 3, 4, 5, 6],
  advanceMinDays: 0,
  advanceMaxDays: 365,
  turnoverNights: 0,
};

export interface GetDirectBookingCalendarCommand {
  from: string;
  to: string;
  guestCount: number;
}

export interface DirectBookingCalendarDayDto {
  date: string;
  available: boolean;
  /** Authoritative night occupancy price (base + season + DOW). Null when unavailable. LOS discounts are stay-level only (see quote). */
  nightlyPrice: string | null;
  currency: string;
  checkInAllowed: boolean;
  checkOutAllowed: boolean;
}

export interface DirectBookingCalendarDto {
  currency: string;
  timezone: string;
  minNights: number;
  maxNights: number;
  maxGuests: number;
  days: DirectBookingCalendarDayDto[];
}

/**
 * Public Direct Booking calendar/batch for browsing.
 * Loads inventory blocks + rate plan + rules once, then projects day cells.
 * Does not create Hold/Quote/Booking/Guest. Stay validity still requires
 * existing availability + quote endpoints.
 */
export class GetDirectBookingCalendarUseCase {
  private readonly pricing = new PricingCalculator();

  constructor(
    private readonly catalog: IDirectBookingCatalogPort,
    private readonly calendarBlocks: ICalendarBlockRepository,
    private readonly availabilityRules: IAvailabilityRulesRepository,
    private readonly ratePlanRepository: IRatePlanRepository,
    private readonly timezoneService: ITimezoneService,
  ) {}

  async execute(
    integration: DirectBookingIntegrationPublicLookup,
    command: GetDirectBookingCalendarCommand,
  ): Promise<Result<DirectBookingCalendarDto, Error>> {
    try {
      assertIntegrationEnabledForPublicAccess(integration);

      const snapshot = await this.catalog.getCatalogSnapshot(
        integration.tenantId,
        integration.propertyId,
        integration.unitId,
      );
      if (!snapshot) {
        return Result.fail(new NotFoundError("Property", integration.propertyId));
      }

      const publishability = evaluateDirectBookingPublishability(
        integration,
        snapshot,
        { requireRatePlan: true },
      );
      assertDirectBookingBookable(publishability);

      if (
        !Number.isInteger(command.guestCount) ||
        command.guestCount < 1 ||
        command.guestCount > snapshot.unit.maxGuests
      ) {
        return Result.fail(new ValidationError("Guest count exceeds unit limit"));
      }

      const from = LocalDate.create(command.from);
      const to = LocalDate.create(command.to);
      if (!to.isAfter(from)) {
        return Result.fail(new ValidationError("to must be after from"));
      }

      const rangeDays = from.daysUntil(to);
      if (rangeDays > DIRECT_BOOKING_CALENDAR_MAX_RANGE_DAYS) {
        return Result.fail(
          new ValidationError(
            `Calendar range exceeds maximum of ${DIRECT_BOOKING_CALENDAR_MAX_RANGE_DAYS} days`,
          ),
        );
      }

      const [rulesStored, ratePlan, blocks, todayStr] = await Promise.all([
        this.availabilityRules.findByUnitId(integration.unitId, integration.tenantId),
        this.ratePlanRepository.findByUnitId(integration.unitId, integration.tenantId),
        this.calendarBlocks.findActiveBlocks(integration.unitId, integration.tenantId),
        this.timezoneService.propertyLocalToday(snapshot.property.timezone),
      ]);

      if (!ratePlan) {
        return Result.fail(new ValidationError("Rate plan not configured for unit"));
      }

      const rules = rulesStored ?? DEFAULT_RULES;
      const today = LocalDate.create(todayStr);
      const unavailableNights = buildUnavailableNightSet(blocks, rules.turnoverNights);

      // One pricing pass for the full [from, to) night span — reuses PricingCalculator
      // (season + DOW). LOS discounts affect stay totals only and are not applied to
      // individual nightlyPrice cells.
      const priced = this.pricing.calculate(
        ratePlan,
        StayPeriod.create(from.value, to.value),
        new Date(),
      );
      const priceByDate = new Map(
        priced.lineItems.map((item) => [item.date, item.adjustedAmount] as const),
      );

      const days: DirectBookingCalendarDayDto[] = [];
      let cursor = from;
      while (cursor.isBefore(to)) {
        const date = cursor.value;
        const available = !unavailableNights.has(date);
        days.push({
          date,
          available,
          nightlyPrice: available ? (priceByDate.get(date) ?? null) : null,
          currency: ratePlan.currency,
          checkInAllowed: isCheckInAllowed(cursor, rules, today),
          checkOutAllowed: isCheckOutAllowed(cursor, rules),
        });
        cursor = cursor.addDays(1);
      }

      return Result.ok({
        currency: ratePlan.currency,
        timezone: snapshot.property.timezone,
        minNights: rules.minNights,
        maxNights: rules.maxNights,
        maxGuests: snapshot.unit.maxGuests,
        days,
      });
    } catch (error) {
      if (
        error instanceof ForbiddenError ||
        error instanceof ValidationError ||
        error instanceof NotFoundError
      ) {
        return Result.fail(error);
      }
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function buildUnavailableNightSet(
  blocks: ActiveCalendarBlock[],
  turnoverNights: number,
): Set<string> {
  const unavailable = new Set<string>();

  for (const block of blocks) {
    if (block.status !== "active") continue;
    const period = StayPeriod.create(block.checkIn, block.checkOut);
    for (const night of period.nights()) {
      unavailable.add(night.value);
    }

    if (turnoverNights > 0 && block.blockType === "booking") {
      const bufferStart = period.checkOut;
      const bufferEnd = bufferStart.addDays(turnoverNights);
      const buffer = StayPeriod.create(bufferStart.value, bufferEnd.value);
      for (const night of buffer.nights()) {
        unavailable.add(night.value);
      }
    }
  }

  return unavailable;
}

function isCheckInAllowed(
  date: LocalDate,
  rules: UnitAvailabilityRulesProps,
  today: LocalDate,
): boolean {
  if (rules.checkInDays.length > 0 && !rules.checkInDays.includes(date.dayOfWeek())) {
    return false;
  }
  const daysUntil = today.daysUntil(date);
  if (daysUntil < rules.advanceMinDays) {
    return false;
  }
  if (rules.advanceMaxDays > 0 && daysUntil > rules.advanceMaxDays) {
    return false;
  }
  return true;
}

function isCheckOutAllowed(
  date: LocalDate,
  rules: UnitAvailabilityRulesProps,
): boolean {
  if (rules.checkOutDays.length > 0 && !rules.checkOutDays.includes(date.dayOfWeek())) {
    return false;
  }
  return true;
}

/** Exported for tests — nightly price projection uses PricingCalculator line items. */
export function projectNightlyPricesForRange(
  ratePlan: RatePlanProps,
  from: string,
  to: string,
  quotedAt: Date = new Date(),
): Map<string, string> {
  const calculator = new PricingCalculator();
  const priced = calculator.calculate(ratePlan, StayPeriod.create(from, to), quotedAt);
  return new Map(priced.lineItems.map((item) => [item.date, item.adjustedAmount]));
}
