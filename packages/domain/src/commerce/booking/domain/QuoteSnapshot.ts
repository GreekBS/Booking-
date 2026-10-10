import { ValueObject } from "../../../shared/kernel/ValueObject";
import type { NightlyLineItem } from "../../pricing/PricingCalculator";
import type { QuotePricingMode } from "../../shared/types/CommerceTypes";

/**
 * Immutable commercial evidence from the prior agreed quote when stay geometry
 * changes and nightly lines cannot be carried forward without inventing prices.
 * Stored in Quote.snapshot JSON — no schema migration.
 */
export interface PreservedCommercialEvidence {
  previousQuoteId: string;
  previousSnapshotId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  lineItems: NightlyLineItem[];
  subtotalAmount: string;
  feesAmount: string;
  taxesAmount: string;
  totalAmount: string;
  pricingMode: QuotePricingMode;
  /** Why the active snapshot uses a geometry placeholder instead of prior nights. */
  reason: "stay_geometry_changed";
}

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
  /**
   * Commercial provenance. Optional for v1 snapshots — readers default to `talos_calculated`.
   */
  pricingMode?: QuotePricingMode;
  /**
   * Prior agreed breakdown retained when dates change (BFS-1).
   * Active lineItems may then be a non-redistributed geometry placeholder.
   */
  preservedCommercialEvidence?: PreservedCommercialEvidence;
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

  /** Defaults missing / legacy snapshots to RatePlan-derived pricing. */
  get pricingMode(): QuotePricingMode {
    return this.props.pricingMode ?? "talos_calculated";
  }

  get preservedCommercialEvidence(): PreservedCommercialEvidence | null {
    return this.props.preservedCommercialEvidence
      ? clonePreservedEvidence(this.props.preservedCommercialEvidence)
      : null;
  }

  static create(props: QuoteSnapshotProps): QuoteSnapshot {
    const lineItems = Object.freeze(
      props.lineItems.map((item) => Object.freeze({ ...item })),
    ) as NightlyLineItem[];
    return new QuoteSnapshot({
      ...props,
      lineItems,
      quotedAt: new Date(props.quotedAt),
      pricingMode: props.pricingMode,
      preservedCommercialEvidence: props.preservedCommercialEvidence
        ? clonePreservedEvidence(props.preservedCommercialEvidence)
        : undefined,
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
      pricingMode: this.pricingMode,
      ...(this.props.preservedCommercialEvidence
        ? {
            preservedCommercialEvidence: clonePreservedEvidence(
              this.props.preservedCommercialEvidence,
            ),
          }
        : {}),
    };
  }
}

function clonePreservedEvidence(
  evidence: PreservedCommercialEvidence,
): PreservedCommercialEvidence {
  return {
    ...evidence,
    lineItems: evidence.lineItems.map((item) => ({ ...item })),
  };
}
