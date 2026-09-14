import { Money } from "../../shared/value-objects/Money";
import type { Booking } from "../../booking/domain/Booking";
import type { Quote } from "../../booking/domain/Quote";
import type { ApplyStayChangeCommand, StayChangeDraft, StayChangePreview, StayChangeCommitResult } from "../types";
import type { StayAvailabilityEngine } from "./StayAvailabilityEngine";
import type { StayPricingEngine } from "./StayPricingEngine";
import type { QuoteFactory } from "./QuoteFactory";
import type { IIdGenerator } from "../../../shared/ports/IIdGenerator";
import type { ICatalogQueryPort } from "../../ports/CommercePorts";
import { ValidationError } from "../../../shared/errors/DomainError";
import { Result } from "../../../shared/kernel/Result";

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
  ): Promise<Result<StayChangePreview, Error>> {
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
      });
    }

    const pricing = await this.pricingEngine.priceStay(
      booking.tenantId,
      draft.unitId,
      draft.checkIn,
      draft.checkOut,
    );

    if (pricing.isFailure) {
      return Result.fail(pricing.getError());
    }

    const pricingResult = pricing.getValue();
    const proposedTotals = {
      checkIn: draft.checkIn,
      checkOut: draft.checkOut,
      unitId: draft.unitId,
      guestCount: draft.guestCount,
      totalAmount: pricingResult.total.amount,
      currency: pricingResult.currency,
    };

    const delta = Money.create(pricingResult.total.amount, pricingResult.currency).subtract(
      Money.create(currentQuote.snapshot.totalAmount, currentQuote.snapshot.currency),
    );

    return Result.ok({
      available: true,
      unchanged: false,
      reasons: [],
      current: currentTotals,
      proposed: proposedTotals,
      priceDelta: {
        amount: delta.amount,
        currency: delta.currency,
      },
    });
  }

  async commitStayChange(
    booking: Booking,
    draft: StayChangeDraft,
  ): Promise<Result<StayChangeCommitResult, Error>> {
    if (this.isUnchanged(booking, draft)) {
      return Result.fail(new ValidationError("Stay is unchanged"));
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
        new ValidationError(availabilityResult.reasons[0]?.message ?? "Dates not available"),
      );
    }

    const property = await this.catalog.getProperty(propertyId, booking.tenantId);
    if (!property) {
      return Result.fail(new ValidationError("Property not found"));
    }

    const pricing = await this.pricingEngine.priceStay(
      booking.tenantId,
      draft.unitId,
      draft.checkIn,
      draft.checkOut,
    );

    if (pricing.isFailure) {
      return Result.fail(pricing.getError());
    }

    const command: ApplyStayChangeCommand = {
      unitId: draft.unitId,
      propertyId,
      checkIn: draft.checkIn,
      checkOut: draft.checkOut,
      guestCount: draft.guestCount,
    };

    const quote = this.quoteFactory.createForStayChange({
      id: this.idGenerator.generate(),
      snapshotId: this.idGenerator.generate(),
      booking,
      command,
      pricing: pricing.getValue(),
      propertyTimezone: property.timezone,
    });

    booking.applyStayChange(command, quote);

    return Result.ok({ booking, quote });
  }
}
