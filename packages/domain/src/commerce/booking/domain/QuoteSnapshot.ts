import { ValueObject } from "../../../shared/kernel/ValueObject";
import type { NightlyLineItem } from "../../pricing/PricingCalculator";

export interface QuoteSnapshotProps {
  version: number;
  checkIn: string;
  checkOut: string;
  propertyTimezone: string;
  currency: string;
  lineItems: NightlyLineItem[];
  subtotalAmount: string;
  feesAmount: string;
  taxesAmount: string;
  totalAmount: string;
  quotedAt: Date;
}

export class QuoteSnapshot extends ValueObject<QuoteSnapshotProps> {
  private constructor(props: QuoteSnapshotProps) {
    super(props);
  }

  get version(): number {
    return this.props.version;
  }

  get checkIn(): string {
    return this.props.checkIn;
  }

  get checkOut(): string {
    return this.props.checkOut;
  }

  get propertyTimezone(): string {
    return this.props.propertyTimezone;
  }

  get currency(): string {
    return this.props.currency;
  }

  get lineItems(): readonly NightlyLineItem[] {
    return this.props.lineItems;
  }

  get subtotalAmount(): string {
    return this.props.subtotalAmount;
  }

  get feesAmount(): string {
    return this.props.feesAmount;
  }

  get taxesAmount(): string {
    return this.props.taxesAmount;
  }

  get totalAmount(): string {
    return this.props.totalAmount;
  }

  get quotedAt(): Date {
    return this.props.quotedAt;
  }

  static create(props: QuoteSnapshotProps): QuoteSnapshot {
    const lineItems = Object.freeze(
      props.lineItems.map((item) => Object.freeze({ ...item })),
    ) as NightlyLineItem[];
    return new QuoteSnapshot({
      ...props,
      lineItems,
      quotedAt: new Date(props.quotedAt),
    });
  }

  toJSON(): QuoteSnapshotProps {
    return {
      version: this.version,
      checkIn: this.checkIn,
      checkOut: this.checkOut,
      propertyTimezone: this.propertyTimezone,
      currency: this.currency,
      lineItems: this.lineItems.map((item) => ({ ...item })),
      subtotalAmount: this.subtotalAmount,
      feesAmount: this.feesAmount,
      taxesAmount: this.taxesAmount,
      totalAmount: this.totalAmount,
      quotedAt: new Date(this.quotedAt),
    };
  }
}
