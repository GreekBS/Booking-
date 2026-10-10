import { AggregateRoot } from "../../../shared/kernel/Entity";
import { ConflictError, ValidationError } from "../../../shared/errors/DomainError";
import { Money } from "../../shared/value-objects/Money";
import {
  QuoteSnapshot,
  type PreservedCommercialEvidence,
} from "./QuoteSnapshot";
import type { Hold } from "./Hold";
import type { Booking } from "./Booking";
import type { PricingResult } from "../../pricing/PricingCalculator";
import type { QuotePricingMode } from "../../shared/types/CommerceTypes";
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

export interface CreateQuoteForStayChangePreservingTotalProps {
  id: string;
  snapshotId: string;
  booking: Booking;
  command: ApplyStayChangeCommand;
  /** Authoritative current quote — total + pricingMode are preserved. */
  currentQuote: Quote;
  propertyTimezone: string;
  quotedAt?: Date;
}

/**
 * Fixed-total quotes may carry any commercial provenance, including a
 * previously frozen TALOS total (no RatePlan recalculation at commit).
 */
export type FixedTotalQuotePricingMode = QuotePricingMode;

export interface CreateQuoteFromFixedTotalProps {
  id: string;
  snapshotId: string;
  hold: Hold;
  propertyTimezone: string;
  /** Commercial total preserved exactly — no RatePlan recalculation. */
  total: Money;
  pricingMode: FixedTotalQuotePricingMode;
  quotedAt?: Date;
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
      pricingMode: "talos_calculated",
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

  /**
   * Immutable Quote from a fixed commercial total (CSV import / operator entry).
   * Does not invoke RatePlan / StayPricingEngine.
   * Preserves amount + currency exactly (no FX).
   */
  static createFromFixedTotal(props: CreateQuoteFromFixedTotalProps): Quote {
    const hold = props.hold;
    const quotedAt = props.quotedAt ?? new Date();
    hold.assertValidForQuote(quotedAt);

    if (props.total.isZero() || props.total.isNegative()) {
      throw new ValidationError("Fixed quote total must be positive");
    }
    if (
      props.pricingMode !== "imported_csv" &&
      props.pricingMode !== "operator_entered" &&
      props.pricingMode !== "talos_calculated"
    ) {
      throw new ValidationError(
        "Fixed quote requires imported_csv, operator_entered, or talos_calculated pricing mode",
      );
    }

    const currency = props.total.currency;
    const totalAmount = props.total.amount;
    const checkIn = hold.stayPeriod.checkIn.value;
    const checkOut = hold.stayPeriod.checkOut.value;

    // Single synthetic line covering the stay — not a RatePlan nightly breakdown.
    const lineItems = [
      {
        date: checkIn,
        baseAmount: totalAmount,
        adjustedAmount: totalAmount,
        currency,
      },
    ];

    const snapshot = QuoteSnapshot.create({
      version: SNAPSHOT_VERSION,
      checkIn,
      checkOut,
      propertyTimezone: props.propertyTimezone,
      currency,
      lineItems,
      subtotalAmount: totalAmount,
      feesAmount: Money.zero(currency).amount,
      taxesAmount: Money.zero(currency).amount,
      totalAmount,
      quotedAt,
      pricingMode: props.pricingMode,
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
      pricingMode: "talos_calculated",
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

  /**
   * Stay-change quote that preserves the booking's agreed commercial agreement (BFS-1).
   * Does not invoke RatePlan or invent nightly/tax/fee amounts.
   *
   * - Always preserves total, currency, pricingMode, subtotal, fees, taxes.
   * - Same stay dates: carries forward nightly line items (and thus discount display).
   * - Changed stay dates: does not redistribute the total across nights; keeps a
   *   non-redistributed geometry placeholder for subtotal and stores the prior
   *   breakdown in preservedCommercialEvidence.
   */
  static createForStayChangePreservingTotal(
    props: CreateQuoteForStayChangePreservingTotalProps,
  ): Quote {
    const { booking, command, currentQuote } = props;
    const quotedAt = props.quotedAt ?? new Date();
    const current = currentQuote.snapshot;
    const currency = current.currency.trim().toUpperCase();
    const total = Money.create(current.totalAmount, currency);
    const subtotal = Money.create(current.subtotalAmount, currency);
    const fees = Money.create(current.feesAmount, currency);
    const taxes = Money.create(current.taxesAmount, currency);

    if (total.isZero() || total.isNegative()) {
      throw new ValidationError(
        "Cannot preserve a non-positive agreed booking total",
      );
    }

    const pricingMode = current.pricingMode;
    if (
      pricingMode !== "imported_csv" &&
      pricingMode !== "operator_entered" &&
      pricingMode !== "talos_calculated"
    ) {
      throw new ValidationError(
        "Cannot preserve booking total with unsupported pricing mode",
      );
    }

    // Fail closed: fees/taxes must not exceed the agreed total.
    // Note: subtotal + fees + taxes may exceed total when LOS/other discounts
    // reduced the commercial total (discounts are not a separate snapshot field).
    if (subtotal.isNegative() || fees.isNegative() || taxes.isNegative()) {
      throw new ValidationError(
        "Agreed booking commercial components must not be negative",
      );
    }
    const afterFeesTaxes = total.subtract(fees).subtract(taxes);
    if (afterFeesTaxes.isNegative()) {
      throw new ValidationError(
        "Agreed booking total is inconsistent with recorded fees and taxes",
      );
    }

    const datesUnchanged =
      current.checkIn === command.checkIn &&
      current.checkOut === command.checkOut;

    let lineItems: Array<{
      date: string;
      baseAmount: string;
      adjustedAmount: string;
      currency: string;
    }>;
    let preservedCommercialEvidence: PreservedCommercialEvidence | undefined;

    if (datesUnchanged && current.lineItems.length > 0) {
      // Guest-only / unit-only: keep the original commercial nightly breakdown.
      lineItems = current.lineItems.map((item) => ({ ...item }));
    } else {
      // Geometry changed: do not invent per-night prices. Placeholder carries
      // the preserved subtotal only; fees/taxes remain explicit snapshot fields.
      lineItems = [
        {
          date: command.checkIn,
          baseAmount: subtotal.amount,
          adjustedAmount: subtotal.amount,
          currency,
        },
      ];
      preservedCommercialEvidence = {
        previousQuoteId: currentQuote.id,
        previousSnapshotId: currentQuote.snapshotId,
        unitId: currentQuote.unitId,
        checkIn: current.checkIn,
        checkOut: current.checkOut,
        lineItems: current.lineItems.map((item) => ({ ...item })),
        subtotalAmount: current.subtotalAmount,
        feesAmount: current.feesAmount,
        taxesAmount: current.taxesAmount,
        totalAmount: current.totalAmount,
        pricingMode,
        reason: "stay_geometry_changed",
      };
    }

    const snapshot = QuoteSnapshot.create({
      version: SNAPSHOT_VERSION,
      checkIn: command.checkIn,
      checkOut: command.checkOut,
      propertyTimezone: props.propertyTimezone,
      currency,
      lineItems,
      subtotalAmount: subtotal.amount,
      feesAmount: fees.amount,
      taxesAmount: taxes.amount,
      totalAmount: total.amount,
      quotedAt,
      pricingMode,
      preservedCommercialEvidence,
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
