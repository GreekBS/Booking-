import { Quote } from "../../booking/domain/Quote";
import type { Hold } from "../../booking/domain/Hold";
import type { Booking } from "../../booking/domain/Booking";
import type { PricingResult } from "../../pricing/PricingCalculator";
import type { ApplyStayChangeCommand } from "../types";

export interface CreateQuoteFromHoldParams {
  id: string;
  snapshotId: string;
  hold: Hold;
  pricing: PricingResult;
  propertyTimezone: string;
}

export interface CreateQuoteForStayChangeParams {
  id: string;
  snapshotId: string;
  booking: Booking;
  command: ApplyStayChangeCommand;
  pricing: PricingResult;
  propertyTimezone: string;
}

export class QuoteFactory {
  createFromHold(params: CreateQuoteFromHoldParams): Quote {
    return Quote.create({
      id: params.id,
      snapshotId: params.snapshotId,
      hold: params.hold,
      pricing: params.pricing,
      propertyTimezone: params.propertyTimezone,
    });
  }

  createForStayChange(params: CreateQuoteForStayChangeParams): Quote {
    return Quote.createForStayChange({
      id: params.id,
      snapshotId: params.snapshotId,
      booking: params.booking,
      command: params.command,
      pricing: params.pricing,
      propertyTimezone: params.propertyTimezone,
    });
  }
}
