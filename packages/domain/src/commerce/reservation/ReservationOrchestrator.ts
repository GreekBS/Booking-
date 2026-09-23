import { Booking } from "../booking/domain/Booking";
import { Hold } from "../booking/domain/Hold";
import type { Quote } from "../booking/domain/Quote";
import type { PricingResult } from "../pricing/PricingCalculator";
import type {
  ICatalogQueryPort,
  ICalendarBlockRepository,
  IAvailabilityRulesRepository,
  IRatePlanRepository,
  ITimezoneService,
} from "../ports/CommercePorts";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type {
  PrepareReservationCreateParams,
  PreparedReservationCreate,
  StayChangeDraft,
  StayChangePreview,
  StayChangeCommitResult,
} from "./types";
import type { AvailabilityEvaluationResult } from "../availability/AvailabilityEvaluator";
import { StayAvailabilityEngine, type EvaluateStayAvailabilityParams } from "./engines/StayAvailabilityEngine";
import { StayPricingEngine } from "./engines/StayPricingEngine";
import { QuoteFactory } from "./engines/QuoteFactory";
import { StayMutationEngine } from "./engines/StayMutationEngine";
import { ValidationError } from "../../shared/errors/DomainError";
import { Result } from "../../shared/kernel/Result";
import type { MutationOrigin } from "../../shared/types/MutationOrigin";

export interface PrepareHoldParams {
  tenantId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  holdId: string;
  sessionRef?: string | null;
  mutationOrigin?: MutationOrigin | null;
}

export interface PrepareQuoteForHoldParams {
  tenantId: string;
  hold: Hold;
  quoteId: string;
  snapshotId: string;
  propertyTimezone: string;
  quotedAt?: Date;
}

/**
 * Stateless coordinator for reservation write flows. No business rules — see ADR-020.
 */
export class ReservationOrchestrator {
  private readonly availabilityEngine: StayAvailabilityEngine;
  private readonly pricingEngine: StayPricingEngine;
  private readonly quoteFactory: QuoteFactory;
  private readonly mutationEngine: StayMutationEngine;

  constructor(
    catalog: ICatalogQueryPort,
    calendarBlocks: ICalendarBlockRepository,
    availabilityRules: IAvailabilityRulesRepository,
    ratePlanRepository: IRatePlanRepository,
    timezoneService: ITimezoneService,
    idGenerator: IIdGenerator,
  ) {
    this.availabilityEngine = new StayAvailabilityEngine(
      catalog,
      calendarBlocks,
      availabilityRules,
      timezoneService,
    );
    this.pricingEngine = new StayPricingEngine(ratePlanRepository);
    this.quoteFactory = new QuoteFactory();
    this.mutationEngine = new StayMutationEngine(
      this.availabilityEngine,
      this.pricingEngine,
      this.quoteFactory,
      catalog,
      idGenerator,
    );
  }

  evaluateAvailability(
    params: EvaluateStayAvailabilityParams,
  ): Promise<Result<AvailabilityEvaluationResult & { propertyId: string }, Error>> {
    return this.availabilityEngine.evaluate(params);
  }

  priceStay(
    tenantId: string,
    unitId: string,
    checkIn: string,
    checkOut: string,
    quotedAt?: Date,
  ): Promise<Result<PricingResult, Error>> {
    return this.pricingEngine.priceStay(tenantId, unitId, checkIn, checkOut, quotedAt);
  }

  createQuoteFromHold(params: {
    id: string;
    snapshotId: string;
    hold: Hold;
    pricing: PricingResult;
    propertyTimezone: string;
  }): Quote {
    return this.quoteFactory.createFromHold(params);
  }

  async prepareHold(params: PrepareHoldParams): Promise<Result<Hold, Error>> {
    const availability = await this.availabilityEngine.evaluate({
      tenantId: params.tenantId,
      unitId: params.unitId,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      guestCount: params.guestCount,
    });
    if (availability.isFailure) {
      return Result.fail(availability.getError());
    }

    const evaluation = availability.getValue();
    if (!evaluation.available) {
      return Result.fail(
        new ValidationError(evaluation.reasons[0]?.message ?? "Dates not available"),
      );
    }

    return Result.ok(
      Hold.create({
        id: params.holdId,
        tenantId: params.tenantId,
        unitId: params.unitId,
        propertyId: evaluation.propertyId,
        checkIn: params.checkIn,
        checkOut: params.checkOut,
        guestCount: params.guestCount,
        sessionRef: params.sessionRef,
        mutationOrigin: params.mutationOrigin ?? null,
      }),
    );
  }

  async prepareReservationCreate(
    params: PrepareReservationCreateParams,
  ): Promise<Result<PreparedReservationCreate, Error>> {
    const { reservation } = params;
    const confirmationMode = params.confirmationMode ?? reservation.confirmationMode ?? "manual";

    const holdResult = await this.prepareHold({
      tenantId: reservation.tenantId,
      unitId: reservation.unitId,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      guestCount: reservation.guestCount,
      holdId: params.holdId,
      sessionRef: params.idempotencyKey ?? null,
      mutationOrigin: params.mutationOrigin ?? null,
    });
    if (holdResult.isFailure) {
      return Result.fail(holdResult.getError());
    }

    const hold = holdResult.getValue();
    if (hold.propertyId !== reservation.propertyId) {
      return Result.fail(
        new ValidationError("Resolved property does not match reservation command"),
      );
    }

    const quoteResult = await this.prepareQuoteForHold({
      tenantId: reservation.tenantId,
      hold,
      quoteId: params.quoteId,
      snapshotId: params.snapshotId,
      propertyTimezone: params.propertyTimezone,
      quotedAt: params.quotedAt,
    });
    if (quoteResult.isFailure) {
      return Result.fail(quoteResult.getError());
    }

    const quote = quoteResult.getValue();
    const booking = Booking.create({
      id: params.bookingId,
      hold,
      quote,
      guest: reservation.guest,
      confirmationMode,
      mutationOrigin: params.mutationOrigin ?? null,
    });

    return Result.ok({ hold, quote, booking });
  }

  async prepareQuoteForHold(params: PrepareQuoteForHoldParams): Promise<Result<Quote, Error>> {
    const pricing = await this.pricingEngine.priceStay(
      params.tenantId,
      params.hold.unitId,
      params.hold.stayPeriod.checkIn.value,
      params.hold.stayPeriod.checkOut.value,
      params.quotedAt,
    );
    if (pricing.isFailure) {
      return Result.fail(pricing.getError());
    }

    return Result.ok(
      this.quoteFactory.createFromHold({
        id: params.quoteId,
        snapshotId: params.snapshotId,
        hold: params.hold,
        pricing: pricing.getValue(),
        propertyTimezone: params.propertyTimezone,
      }),
    );
  }

  previewStayChange(
    booking: Booking,
    draft: StayChangeDraft,
    currentQuote: Quote,
  ): Promise<Result<StayChangePreview, Error>> {
    return this.mutationEngine.previewStayChange(booking, draft, currentQuote);
  }

  commitStayChange(
    booking: Booking,
    draft: StayChangeDraft,
    mutationOrigin?: MutationOrigin | null,
  ): Promise<Result<StayChangeCommitResult, Error>> {
    return this.mutationEngine.commitStayChange(booking, draft, mutationOrigin);
  }
}
