import { Money } from "../../shared/value-objects/Money";
import type { Booking } from "../../booking/domain/Booking";
import type { Quote } from "../../booking/domain/Quote";
import type {
  ApplyStayChangeCommand,
  StayChangeCommercialMode,
  StayChangeDraft,
  StayChangePreview,
  StayChangeCommitResult,
} from "../types";
import type { StayAvailabilityEngine } from "./StayAvailabilityEngine";
import type { StayPricingEngine } from "./StayPricingEngine";
import type { QuoteFactory } from "./QuoteFactory";
import type { IIdGenerator } from "../../../shared/ports/IIdGenerator";
import type { ICatalogQueryPort } from "../../ports/CommercePorts";
import { ValidationError } from "../../../shared/errors/DomainError";
import { Result } from "../../../shared/kernel/Result";
import type { MutationOrigin } from "../../../shared/types/MutationOrigin";
import type { BookingPricingIntent } from "../../shared/types/CommerceTypes";

export class StayMutationEngine {
  constructor(
    private readonly availabilityEngine: StayAvailabilityEngine,
    private readonly pricingEngine: StayPricingEngine,
    private readonly quoteFactory: QuoteFactory,
    private readonly catalog: ICatalogQueryPort,
    private readonly idGenerator: IIdGenerator,
  ) {}

  isUnchanged(booking: Booking, draft: StayChangeDraft): boolean {
    return (
      booking.unitId === draft.unitId &&
      booking.stayPeriod.checkIn.value === draft.checkIn &&
      booking.stayPeriod.checkOut.value === draft.checkOut &&
      booking.guestCount.value === draft.guestCount
    );
  }

  async previewStayChange(
    booking: Booking,
    draft: StayChangeDraft,
    currentQuote: Quote,
    commercial: StayChangeCommercialMode = {
      source: "operator",
      pricingIntent: "preserve_agreed_total",
    },
  ): Promise<Result<StayChangePreview, Error>> {
    try {
      const intentResult = resolveOperatorIntent(commercial);
      if (intentResult.isFailure) return Result.fail(intentResult.getError());
      const pricingIntent = intentResult.getValue();

      const unchanged = this.isUnchanged(booking, draft);
      const currentTotals = {
        checkIn: booking.stayPeriod.checkIn.value,
        checkOut: booking.stayPeriod.checkOut.value,
        unitId: booking.unitId,
        guestCount: booking.guestCount.value,
        totalAmount: currentQuote.snapshot.totalAmount,
        currency: currentQuote.snapshot.currency,
      };

      if (unchanged) {
        return Result.ok({
          available: true,
          unchanged: true,
          reasons: [],
          current: currentTotals,
          proposed: { ...currentTotals },
          priceDelta: null,
          pricingIntent,
        });
      }

      const availability = await this.availabilityEngine.evaluate({
        tenantId: booking.tenantId,
        unitId: draft.unitId,
        checkIn: draft.checkIn,
        checkOut: draft.checkOut,
        guestCount: draft.guestCount,
        excludeSourceIds: [booking.id],
      });

      if (availability.isFailure) {
        return Result.fail(availability.getError());
      }

      const availabilityResult = availability.getValue();
      if (!availabilityResult.available) {
        return Result.ok({
          available: false,
          unchanged: false,
          reasons: availabilityResult.reasons,
          current: currentTotals,
          proposed: null,
          priceDelta: null,
          pricingIntent,
        });
      }

      // BFS-1: preview always reflects preserve_agreed_total (zero financial delta).
      const proposedTotals = {
        checkIn: draft.checkIn,
        checkOut: draft.checkOut,
        unitId: draft.unitId,
        guestCount: draft.guestCount,
        totalAmount: currentQuote.snapshot.totalAmount,
        currency: currentQuote.snapshot.currency,
      };
      const zero = Money.zero(currentQuote.snapshot.currency);
      return Result.ok({
        available: true,
        unchanged: false,
        reasons: [],
        current: currentTotals,
        proposed: proposedTotals,
        priceDelta: {
          amount: zero.amount,
          currency: zero.currency,
        },
        pricingIntent,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async commitStayChange(
    booking: Booking,
    draft: StayChangeDraft,
    currentQuote: Quote,
    options?: {
      mutationOrigin?: MutationOrigin | null;
      commercial?: StayChangeCommercialMode;
    },
  ): Promise<Result<StayChangeCommitResult, Error>> {
    try {
      const commercial: StayChangeCommercialMode = options?.commercial ?? {
        source: "operator",
        pricingIntent: "preserve_agreed_total",
      };
      const mutationOrigin = options?.mutationOrigin ?? null;

      if (this.isUnchanged(booking, draft)) {
        return Result.fail(new ValidationError("Stay is unchanged"));
      }

      if (commercial.source === "operator") {
        const intentResult = resolveOperatorIntent(commercial);
        if (intentResult.isFailure) return Result.fail(intentResult.getError());
      }

      const availability = await this.availabilityEngine.evaluate({
        tenantId: booking.tenantId,
        unitId: draft.unitId,
        checkIn: draft.checkIn,
        checkOut: draft.checkOut,
        guestCount: draft.guestCount,
        excludeSourceIds: [booking.id],
      });

      if (availability.isFailure) {
        return Result.fail(availability.getError());
      }

      const availabilityValue = availability.getValue();
      const { propertyId, ...availabilityResult } = availabilityValue;
      if (!availabilityResult.available) {
        return Result.fail(
          new ValidationError(
            availabilityResult.reasons[0]?.message ?? "Dates not available",
          ),
        );
      }

      const property = await this.catalog.getProperty(propertyId, booking.tenantId);
      if (!property) {
        return Result.fail(new ValidationError("Property not found"));
      }

      const command: ApplyStayChangeCommand = {
        unitId: draft.unitId,
        propertyId,
        checkIn: draft.checkIn,
        checkOut: draft.checkOut,
        guestCount: draft.guestCount,
      };

      let quote: Quote;

      if (commercial.source === "channel_compat_reprice") {
        // BFS-1 isolated OTA compatibility: keep pre-BFS RatePlan reprice until BFS-7.
        const pricing = await this.pricingEngine.priceStay(
          booking.tenantId,
          draft.unitId,
          draft.checkIn,
          draft.checkOut,
        );
        if (pricing.isFailure) {
          return Result.fail(pricing.getError());
        }
        quote = this.quoteFactory.createForStayChange({
          id: this.idGenerator.generate(),
          snapshotId: this.idGenerator.generate(),
          booking,
          command,
          pricing: pricing.getValue(),
          propertyTimezone: property.timezone,
        });
      } else {
        quote = this.quoteFactory.createForStayChangePreservingTotal({
          id: this.idGenerator.generate(),
          snapshotId: this.idGenerator.generate(),
          booking,
          command,
          currentQuote,
          propertyTimezone: property.timezone,
        });
      }

      booking.applyStayChange(command, quote, new Date(), mutationOrigin);

      return Result.ok({ booking, quote });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function resolveOperatorIntent(
  commercial: StayChangeCommercialMode,
): Result<BookingPricingIntent, Error> {
  if (commercial.source === "channel_compat_reprice") {
    return Result.ok("preserve_agreed_total");
  }

  const intent = commercial.pricingIntent ?? "preserve_agreed_total";

  if (intent === "manual_total") {
    return Result.fail(
      new ValidationError(
        "manual_total is not supported on stay change; use the dedicated price adjustment workflow",
      ),
    );
  }

  if (intent === "recalculate_from_rate_plan") {
    return Result.fail(
      new ValidationError(
        "recalculate_from_rate_plan requires BFS-2 confirmation and is not available yet",
      ),
    );
  }

  if (intent !== "preserve_agreed_total") {
    return Result.fail(new ValidationError("Unsupported pricing intent"));
  }

  return Result.ok(intent);
}
