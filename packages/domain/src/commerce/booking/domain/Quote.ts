import { AggregateRoot } from "../../../shared/kernel/Entity";
import { ConflictError } from "../../../shared/errors/DomainError";
import { Money } from "../../shared/value-objects/Money";
import { QuoteSnapshot } from "./QuoteSnapshot";
import type { Hold } from "./Hold";
import type { Booking } from "./Booking";
import type { PricingResult } from "../../pricing/PricingCalculator";
import { SNAPSHOT_VERSION } from "../../shared/types/CommerceTypes";
import { STAY_CHANGE_QUOTE_TTL_MS, type ApplyStayChangeCommand } from "../../reservation/types";
import { QuoteCreatedEvent } from "./events/CommerceEvents";

export interface QuoteProps {
  id: string;
  tenantId: string;
  holdId: string;
  unitId: string;
  propertyId: string;
  snapshotId: string;
  snapshot: QuoteSnapshot;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreateQuoteProps {
  id: string;
  snapshotId: string;
  hold: Hold;
  pricing: PricingResult;
  propertyTimezone: string;
  feesAmount?: string;
  taxesAmount?: string;
}

export interface CreateQuoteForStayChangeProps {
  id: string;
  snapshotId: string;
  booking: Booking;
  command: ApplyStayChangeCommand;
  pricing: PricingResult;
  propertyTimezone: string;
  feesAmount?: string;
  taxesAmount?: string;
}

export class Quote extends AggregateRoot<QuoteProps> {
  private constructor(props: QuoteProps) {
    super(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get holdId(): string {
    return this.props.holdId;
  }

  get unitId(): string {
    return this.props.unitId;
  }

  get propertyId(): string {
    return this.props.propertyId;
  }

  get snapshotId(): string {
    return this.props.snapshotId;
  }

  get snapshot(): QuoteSnapshot {
    return this.props.snapshot;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  static create(props: CreateQuoteProps): Quote {
    const hold = props.hold;
    hold.assertValidForQuote(props.pricing.quotedAt);

    const feesAmount = props.feesAmount ?? "0.0000";
    const taxesAmount = props.taxesAmount ?? "0.0000";
    const currency = props.pricing.currency;
    const totalWithFees = props.pricing.total
      .add(Money.create(feesAmount, currency))
      .add(Money.create(taxesAmount, currency));
    const snapshot = QuoteSnapshot.create({
      version: SNAPSHOT_VERSION,
      checkIn: hold.stayPeriod.checkIn.value,
      checkOut: hold.stayPeriod.checkOut.value,
      propertyTimezone: props.propertyTimezone,
      currency: props.pricing.currency,
      lineItems: props.pricing.lineItems,
      subtotalAmount: props.pricing.subtotal.amount,
      feesAmount,
      taxesAmount,
      totalAmount: totalWithFees.amount,
      quotedAt: props.pricing.quotedAt,
    });

    const quote = new Quote({
      id: props.id,
      tenantId: hold.tenantId,
      holdId: hold.id,
      unitId: hold.unitId,
      propertyId: hold.propertyId,
      snapshotId: props.snapshotId,
      snapshot,
      expiresAt: new Date(hold.expiresAt),
      createdAt: props.pricing.quotedAt,
    });

    quote.addDomainEvent(
      new QuoteCreatedEvent(quote.id, quote.tenantId, {
        holdId: quote.holdId,
        unitId: quote.unitId,
        propertyId: quote.propertyId,
        totalAmount: snapshot.totalAmount,
        currency: snapshot.currency,
      }),
    );

    return quote;
  }

  static createForStayChange(props: CreateQuoteForStayChangeProps): Quote {
    const { booking, command, pricing } = props;
    const quotedAt = pricing.quotedAt;

    const feesAmount = props.feesAmount ?? "0.0000";
    const taxesAmount = props.taxesAmount ?? "0.0000";
    const currency = pricing.currency;
    const totalWithFees = pricing.total
      .add(Money.create(feesAmount, currency))
      .add(Money.create(taxesAmount, currency));
    const snapshot = QuoteSnapshot.create({
      version: SNAPSHOT_VERSION,
      checkIn: command.checkIn,
      checkOut: command.checkOut,
      propertyTimezone: props.propertyTimezone,
      currency: pricing.currency,
      lineItems: pricing.lineItems,
      subtotalAmount: pricing.subtotal.amount,
      feesAmount,
      taxesAmount,
      totalAmount: totalWithFees.amount,
      quotedAt,
    });

    const quote = new Quote({
      id: props.id,
      tenantId: booking.tenantId,
      holdId: booking.holdId,
      unitId: command.unitId,
      propertyId: command.propertyId,
      snapshotId: props.snapshotId,
      snapshot,
      expiresAt: new Date(quotedAt.getTime() + STAY_CHANGE_QUOTE_TTL_MS),
      createdAt: quotedAt,
    });

    quote.addDomainEvent(
      new QuoteCreatedEvent(quote.id, quote.tenantId, {
        holdId: quote.holdId,
        unitId: quote.unitId,
        propertyId: quote.propertyId,
        totalAmount: snapshot.totalAmount,
        currency: snapshot.currency,
      }),
    );

    return quote;
  }

  static reconstitute(props: QuoteProps): Quote {
    return new Quote({
      ...props,
      snapshot: QuoteSnapshot.create(props.snapshot.toJSON()),
      expiresAt: new Date(props.expiresAt),
      createdAt: new Date(props.createdAt),
    });
  }

  isExpired(at: Date = new Date()): boolean {
    return at.getTime() >= this.props.expiresAt.getTime();
  }

  assertValidForBooking(at: Date = new Date()): void {
    if (this.isExpired(at)) {
      throw new ConflictError("Quote has expired");
    }
  }
}
