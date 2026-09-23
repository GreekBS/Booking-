import { ValidationError } from "../../shared/errors/DomainError";

/** Platform statutory vs tenant commercial configuration. */
export type TaxRuleScope = "platform_statutory" | "tenant_commercial";

export type TaxType =
  | "vat"
  | "climate_resilience_fee"
  | "other_levy";

export type CalculationKind =
  | "PERCENTAGE"
  | "FIXED_PER_NIGHT"
  | "FIXED_PER_ROOM"
  | "FIXED_PER_STAY"
  | "PER_PERSON"
  | "PER_PERSON_PER_NIGHT";

export type TaxBasis = "NET" | "GROSS" | "QUANTITY";

/**
 * Charge categories resolve independently — do not assume extras share
 * accommodation VAT.
 */
export type ChargeCategory =
  | "accommodation"
  | "extra"
  | "service"
  | "fee"
  | "food_beverage"
  | "other";

export type AccommodationType =
  | "hotel"
  | "furnished_rooms_apartments"
  | "short_term_rental"
  | "villa_self_catering"
  | "tourist_furnished_house"
  | "other";

/**
 * Property / hotel classification keys used by climate-fee matrix.
 * Missing required classification fails closed at evaluation time.
 */
export type PropertyClassification =
  | "hotel_stars_1_2"
  | "hotel_stars_3"
  | "hotel_stars_4"
  | "hotel_stars_5"
  | "furnished_rooms_apartments"
  | "short_term_rental"
  | "short_term_rental_detached_gt_80sqm"
  | "villa_self_catering"
  | "tourist_furnished_house_lt_80sqm"
  | "tourist_furnished_house_gte_80sqm"
  | "unclassified";

export interface TaxRuleSeasonMonths {
  /** Inclusive month numbers 1–12. Empty / null = all year. */
  months: number[];
}

export interface TaxRuleProps {
  id: string;
  /** null tenantId = platform statutory catalog row. */
  tenantId: string | null;
  scope: TaxRuleScope;
  country: string;
  /**
   * Fiscal jurisdiction code (e.g. GR, GR-ISLAND-REDUCED).
   * Assigned on BusinessFiscalProfile — never guessed from geography in TaxEngine.
   */
  jurisdiction: string;
  taxType: TaxType;
  classificationKey: string;
  chargeCategory: ChargeCategory | null;
  accommodationType: AccommodationType | null;
  propertyClassification: PropertyClassification | null;
  calculationKind: CalculationKind;
  /** Percentage string e.g. "13.0000" when PERCENTAGE. */
  ratePercent: string | null;
  /** Fixed money amount string (4dp) when FIXED_*. */
  fixedAmount: string | null;
  currency: string;
  basis: TaxBasis;
  validFrom: Date;
  validUntil: Date | null;
  season: TaxRuleSeasonMonths | null;
  /** Optional floor-area threshold (sqm) for size-gated rules. */
  floorAreaMinSqm: number | null;
  floorAreaMaxExclusiveSqm: number | null;
  /** Authoritative source citation for statutory seeds. */
  legalSource: string | null;
  legalVersion: string | null;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

export class TaxRule {
  private constructor(private readonly props: TaxRuleProps) {}

  static create(props: TaxRuleProps): TaxRule {
    const country = props.country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) {
      throw new ValidationError(`Invalid tax rule country: ${props.country}`);
    }
    if (!props.jurisdiction.trim()) {
      throw new ValidationError("Tax rule jurisdiction required");
    }
    if (!props.classificationKey.trim()) {
      throw new ValidationError("Tax rule classificationKey required");
    }
    if (props.calculationKind === "PERCENTAGE" && !props.ratePercent) {
      throw new ValidationError("PERCENTAGE tax rule requires ratePercent");
    }
    if (
      props.calculationKind !== "PERCENTAGE" &&
      props.basis !== "QUANTITY" &&
      !props.fixedAmount &&
      props.calculationKind.startsWith("FIXED")
    ) {
      throw new ValidationError("FIXED tax rule requires fixedAmount");
    }
    if (props.scope === "platform_statutory" && props.tenantId !== null) {
      throw new ValidationError("Platform statutory TaxRule must have null tenantId");
    }
    if (props.scope === "tenant_commercial" && !props.tenantId) {
      throw new ValidationError("Tenant commercial TaxRule requires tenantId");
    }
    return new TaxRule({
      ...props,
      country,
      jurisdiction: props.jurisdiction.trim(),
      classificationKey: props.classificationKey.trim(),
      currency: props.currency.trim().toUpperCase(),
      validFrom: new Date(props.validFrom),
      validUntil: props.validUntil ? new Date(props.validUntil) : null,
      createdAt: new Date(props.createdAt),
      updatedAt: new Date(props.updatedAt),
    });
  }

  static rehydrate(props: TaxRuleProps): TaxRule {
    return TaxRule.create(props);
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string | null {
    return this.props.tenantId;
  }
  get scope(): TaxRuleScope {
    return this.props.scope;
  }
  get country(): string {
    return this.props.country;
  }
  get jurisdiction(): string {
    return this.props.jurisdiction;
  }
  get taxType(): TaxType {
    return this.props.taxType;
  }
  get classificationKey(): string {
    return this.props.classificationKey;
  }
  get chargeCategory(): ChargeCategory | null {
    return this.props.chargeCategory;
  }
  get accommodationType(): AccommodationType | null {
    return this.props.accommodationType;
  }
  get propertyClassification(): PropertyClassification | null {
    return this.props.propertyClassification;
  }
  get calculationKind(): CalculationKind {
    return this.props.calculationKind;
  }
  get ratePercent(): string | null {
    return this.props.ratePercent;
  }
  get fixedAmount(): string | null {
    return this.props.fixedAmount;
  }
  get currency(): string {
    return this.props.currency;
  }
  get basis(): TaxBasis {
    return this.props.basis;
  }
  get validFrom(): Date {
    return this.props.validFrom;
  }
  get validUntil(): Date | null {
    return this.props.validUntil;
  }
  get season(): TaxRuleSeasonMonths | null {
    return this.props.season;
  }
  get floorAreaMinSqm(): number | null {
    return this.props.floorAreaMinSqm;
  }
  get floorAreaMaxExclusiveSqm(): number | null {
    return this.props.floorAreaMaxExclusiveSqm;
  }
  get legalSource(): string | null {
    return this.props.legalSource;
  }
  get legalVersion(): string | null {
    return this.props.legalVersion;
  }
  get priority(): number {
    return this.props.priority;
  }

  toProps(): TaxRuleProps {
    return {
      ...this.props,
      validFrom: new Date(this.props.validFrom),
      validUntil: this.props.validUntil
        ? new Date(this.props.validUntil)
        : null,
      season: this.props.season
        ? { months: [...this.props.season.months] }
        : null,
      createdAt: new Date(this.props.createdAt),
      updatedAt: new Date(this.props.updatedAt),
    };
  }

  isEffectiveOn(at: Date): boolean {
    if (at < this.props.validFrom) return false;
    if (this.props.validUntil && at >= this.props.validUntil) return false;
    return true;
  }

  matchesSeasonMonth(month: number): boolean {
    if (!this.props.season || this.props.season.months.length === 0) return true;
    return this.props.season.months.includes(month);
  }

  matchesFloorArea(sqm: number | null): boolean {
    if (this.props.floorAreaMinSqm == null && this.props.floorAreaMaxExclusiveSqm == null) {
      return true;
    }
    if (sqm == null) return false;
    if (this.props.floorAreaMinSqm != null && sqm < this.props.floorAreaMinSqm) {
      return false;
    }
    if (
      this.props.floorAreaMaxExclusiveSqm != null &&
      sqm >= this.props.floorAreaMaxExclusiveSqm
    ) {
      return false;
    }
    return true;
  }
}
