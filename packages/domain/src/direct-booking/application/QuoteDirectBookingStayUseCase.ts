import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, NotFoundError, ValidationError } from "../../shared/errors/DomainError";
import type { PricingResult } from "../../commerce/pricing/PricingCalculator";
import type { ReservationOrchestrator } from "../../commerce/reservation/ReservationOrchestrator";
import type {
  DirectBookingIntegrationPublicLookup,
  IDirectBookingCatalogPort,
} from "../ports/DirectBookingPorts";
import {
  assertDirectBookingBookable,
  assertIntegrationEnabledForPublicAccess,
  evaluateDirectBookingPublishability,
} from "./publishability";

export interface QuoteDirectBookingStayCommand {
  checkIn: string;
  checkOut: string;
  guestCount: number;
}

export interface DirectBookingQuoteDto {
  checkIn: string;
  checkOut: string;
  nights: number;
  guestCount: number;
  currency: string;
  subtotal: string;
  total: string;
  lineItems: Array<{
    date: string;
    amount: string;
    currency: string;
  }>;
  quotedAt: string;
}

/**
 * Read-only Direct Booking quote.
 * Reuses StayPricingEngine via ReservationOrchestrator.priceStay.
 * Does NOT create Hold, Quote, Booking, or Guest records.
 * Clients cannot submit or override nightly rates / totals.
 */
export class QuoteDirectBookingStayUseCase {
  constructor(
    private readonly catalog: IDirectBookingCatalogPort,
    private readonly orchestrator: ReservationOrchestrator,
  ) {}

  async execute(
    integration: DirectBookingIntegrationPublicLookup,
    command: QuoteDirectBookingStayCommand,
  ): Promise<Result<DirectBookingQuoteDto, Error>> {
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

      // Availability gate before pricing — fail closed on blocked inventory.
      const availability = await this.orchestrator.evaluateAvailability({
        tenantId: integration.tenantId,
        unitId: integration.unitId,
        checkIn: command.checkIn,
        checkOut: command.checkOut,
        guestCount: command.guestCount,
      });
      if (availability.isFailure) {
        return Result.fail(availability.getError());
      }
      if (!availability.getValue().available) {
        return Result.fail(new ValidationError("Stay is not available"));
      }

      const priced = await this.orchestrator.priceStay(
        integration.tenantId,
        integration.unitId,
        command.checkIn,
        command.checkOut,
      );
      if (priced.isFailure) {
        return Result.fail(priced.getError());
      }

      return Result.ok(
        mapQuoteDto(priced.getValue(), command.checkIn, command.checkOut, command.guestCount),
      );
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

function mapQuoteDto(
  pricing: PricingResult,
  checkIn: string,
  checkOut: string,
  guestCount: number,
): DirectBookingQuoteDto {
  return {
    checkIn,
    checkOut,
    nights: pricing.lineItems.length,
    guestCount,
    currency: pricing.currency,
    subtotal: pricing.subtotal.amount,
    total: pricing.total.amount,
    lineItems: pricing.lineItems.map((item) => ({
      date: item.date,
      amount: item.adjustedAmount,
      currency: item.currency,
    })),
    quotedAt: pricing.quotedAt.toISOString(),
  };
}
