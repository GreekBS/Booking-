import { StayPeriod } from "../shared/value-objects/StayPeriod";
import { LocalDate } from "../shared/value-objects/LocalDate";
import { GuestCount } from "../shared/value-objects/GuestCount";
import type {
  ActiveCalendarBlock,
  AvailabilityReason,
  UnitAvailabilityRulesProps,
} from "../shared/types/CommerceTypes";

export interface AvailabilityEvaluationInput {
  stayPeriod: StayPeriod;
  guestCount: GuestCount;
  unitMaxGuests: number;
  rules: UnitAvailabilityRulesProps;
  activeBlocks: ActiveCalendarBlock[];
  propertyLocalToday: LocalDate;
  /** Skip blocks tied to these source IDs (e.g. current booking during stay change). */
  excludeSourceIds?: string[];
}

export interface NightAvailability {
  date: string;
  available: boolean;
}

export interface AvailabilityEvaluationResult {
  available: boolean;
  reasons: AvailabilityReason[];
  nights: NightAvailability[];
}

const ACTIVE_BLOCK_STATUSES = new Set(["active"]);

export class AvailabilityEvaluator {
  evaluate(input: AvailabilityEvaluationInput): AvailabilityEvaluationResult {
    const reasons: AvailabilityReason[] = [];
    const nights = input.stayPeriod.nights().map((night) => ({
      date: night.value,
      available: true,
    }));

    this.validateGuestCount(input, reasons);
    this.validateStayLength(input, reasons);
    this.validateCheckInDay(input, reasons);
    this.validateCheckOutDay(input, reasons);
    this.validateAdvanceWindow(input, reasons);
    this.validateBlocks(input, nights, reasons);
    this.validateTurnoverBuffer(input, reasons);

    const available = reasons.length === 0;
    if (!available) {
      for (const night of nights) {
        night.available = false;
      }
    }

    return { available, reasons, nights };
  }

  private validateGuestCount(
    input: AvailabilityEvaluationInput,
    reasons: AvailabilityReason[],
  ): void {
    if (input.guestCount.value > input.unitMaxGuests) {
      reasons.push({
        code: "GUEST_COUNT_EXCEEDED",
        message: `Guest count ${input.guestCount.value} exceeds unit max ${input.unitMaxGuests}`,
      });
    }
  }

  private validateStayLength(
    input: AvailabilityEvaluationInput,
    reasons: AvailabilityReason[],
  ): void {
    const nights = input.stayPeriod.nightCount();
    if (nights < input.rules.minNights) {
      reasons.push({
        code: "MIN_NIGHTS",
        message: `Stay requires at least ${input.rules.minNights} nights`,
      });
    }
    if (nights > input.rules.maxNights) {
      reasons.push({
        code: "MAX_NIGHTS",
        message: `Stay exceeds maximum ${input.rules.maxNights} nights`,
      });
    }
  }

  private validateCheckInDay(
    input: AvailabilityEvaluationInput,
    reasons: AvailabilityReason[],
  ): void {
    const checkInDay = input.stayPeriod.checkIn.dayOfWeek();
    if (
      input.rules.checkInDays.length > 0 &&
      !input.rules.checkInDays.includes(checkInDay)
    ) {
      reasons.push({
        code: "CHECK_IN_DAY",
        message: `Check-in not allowed on weekday ${checkInDay}`,
      });
    }
  }

  private validateCheckOutDay(
    input: AvailabilityEvaluationInput,
    reasons: AvailabilityReason[],
  ): void {
    const checkOutDay = input.stayPeriod.checkOut.dayOfWeek();
    if (
      input.rules.checkOutDays.length > 0 &&
      !input.rules.checkOutDays.includes(checkOutDay)
    ) {
      reasons.push({
        code: "CHECK_OUT_DAY",
        message: `Check-out not allowed on weekday ${checkOutDay}`,
      });
    }
  }

  private validateAdvanceWindow(
    input: AvailabilityEvaluationInput,
    reasons: AvailabilityReason[],
  ): void {
    const daysUntilCheckIn = input.propertyLocalToday.daysUntil(input.stayPeriod.checkIn);
    if (daysUntilCheckIn < input.rules.advanceMinDays) {
      reasons.push({
        code: "ADVANCE_MIN",
        message: `Booking must be at least ${input.rules.advanceMinDays} days in advance`,
      });
    }
    if (
      input.rules.advanceMaxDays > 0 &&
      daysUntilCheckIn > input.rules.advanceMaxDays
    ) {
      reasons.push({
        code: "ADVANCE_MAX",
        message: `Booking cannot be more than ${input.rules.advanceMaxDays} days in advance`,
      });
    }
  }

  private shouldExcludeBlock(
    block: ActiveCalendarBlock,
    excludeSourceIds: string[] | undefined,
  ): boolean {
    if (!excludeSourceIds?.length || !block.sourceId) {
      return false;
    }
    return excludeSourceIds.includes(block.sourceId);
  }

  private validateBlocks(
    input: AvailabilityEvaluationInput,
    nights: NightAvailability[],
    reasons: AvailabilityReason[],
  ): void {
    const stayPeriod = input.stayPeriod;
    for (const block of input.activeBlocks) {
      if (!ACTIVE_BLOCK_STATUSES.has(block.status)) {
        continue;
      }
      if (this.shouldExcludeBlock(block, input.excludeSourceIds)) {
        continue;
      }

      const blockPeriod = StayPeriod.create(block.checkIn, block.checkOut);
      if (stayPeriod.overlaps(blockPeriod)) {
        reasons.push({
          code: "BLOCKED",
          message: `Dates overlap with ${block.blockType} block`,
        });

        for (const night of nights) {
          const nightDate = LocalDate.create(night.date);
          if (blockPeriod.containsNight(nightDate)) {
            night.available = false;
          }
        }
      }
    }
  }

  private validateTurnoverBuffer(
    input: AvailabilityEvaluationInput,
    reasons: AvailabilityReason[],
  ): void {
    if (input.rules.turnoverNights <= 0) {
      return;
    }

    for (const block of input.activeBlocks) {
      if (block.blockType !== "booking" || !ACTIVE_BLOCK_STATUSES.has(block.status)) {
        continue;
      }
      if (this.shouldExcludeBlock(block, input.excludeSourceIds)) {
        continue;
      }

      const blockPeriod = StayPeriod.create(block.checkIn, block.checkOut);
      const bufferStart = blockPeriod.checkOut;
      const bufferEnd = bufferStart.addDays(input.rules.turnoverNights);
      const bufferPeriod = StayPeriod.create(bufferStart.value, bufferEnd.value);

      if (input.stayPeriod.overlaps(bufferPeriod)) {
        reasons.push({
          code: "TURNOVER_BUFFER",
          message: `Turnover buffer of ${input.rules.turnoverNights} nights required after checkout`,
        });
        return;
      }
    }
  }
}
