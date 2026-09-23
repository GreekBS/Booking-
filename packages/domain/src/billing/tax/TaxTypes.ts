import { Money } from "../../commerce/shared/value-objects/Money";
import type {
  AccommodationType,
  ChargeCategory,
  PropertyClassification,
  TaxType,
} from "./TaxRule";
import type { TaxRule } from "./TaxRule";

export interface TaxLineInput {
  /** Stable id for provenance (e.g. folio line id). */
  lineId: string;
  chargeCategory: ChargeCategory;
  /** Source monetary amount (NET or GROSS per context.amountBasis). */
  amount: Money;
  description?: string;
}

export interface TaxContext {
  tenantId: string;
  country: string;
  /**
   * Resolved VAT jurisdiction code (e.g. GR, GR-ISLAND-REDUCED).
   * Derived outside TaxEngine — never free-selected reduced shortcut.
   */
  jurisdiction: string;
  currency: string;
  /** Evaluation instant for VAT / non-daily rules (typically check-in). */
  asOf: Date;
  accommodationType: AccommodationType;
  propertyClassification: PropertyClassification | null;
  /** Floor area sqm when size-gated climate rules apply. */
  floorAreaSqm: number | null;
  /**
   * Each stay night / daily-use date (YYYY-MM-DD), exclusive of check-out.
   * Required for climate fee night-by-night evaluation.
   */
  stayNightDates: string[];
  roomOrApartmentCount: number;
  guestCount: number;
  /**
   * When true, every daily use is complimentary (levy 0, uses still counted).
   * Prefer complimentaryNightDates for per-night control.
   */
  complimentaryStay: boolean;
  /** Optional set of YYYY-MM-DD nights that are complimentary. */
  complimentaryNightDates?: string[];
  amountBasis: "NET" | "GROSS";
  lines: TaxLineInput[];
}

export interface ClimateDailyUseSnapshot {
  date: string;
  roomIndex: number;
  complimentary: boolean;
  ruleId: string;
  ruleValidFrom: string;
  ruleValidUntil: string | null;
  appliedFixedAmount: string;
  calculatedAmount: string;
  seasonMonth: number;
}

export interface TaxComponentSnapshot {
  taxType: TaxType;
  classificationKey: string;
  calculationKind: string;
  appliedRatePercent: string | null;
  appliedFixedAmount: string | null;
  taxableBase: string | null;
  calculatedAmount: string;
  currency: string;
  ruleId: string;
  ruleScope: string;
  ruleValidFrom: string;
  ruleValidUntil: string | null;
  jurisdiction: string;
  chargeCategory: ChargeCategory | null;
  legalSource: string | null;
  legalVersion: string | null;
  sourceLineId: string | null;
  metadata: TaxComponentMetadata;
}

export interface TaxComponentMetadata {
  /** Climate / quantity reporting. */
  totalDailyUses?: number;
  complimentaryDailyUses?: number;
  taxableDailyUses?: number;
  complimentaryStay?: boolean;
  nightCount?: number;
  roomOrApartmentCount?: number;
  amountBasis?: "NET" | "GROSS";
  /** Per daily-use provenance — not collapsed. */
  dailyUses?: ClimateDailyUseSnapshot[];
  /** Document boundary: climate fee needs separate F3 fiscal document. */
  requiresSeparateFiscalDocument?: boolean;
  fiscalDocumentKindHint?: "climate_resilience_fee_special_element" | null;
}

export interface TaxEvaluation {
  currency: string;
  jurisdiction: string;
  asOf: string;
  components: TaxComponentSnapshot[];
  vatTotal: string;
  levyTotal: string;
  taxTotal: string;
  /** Rules used — frozen identities for Folio posting. */
  appliedRuleIds: string[];
}

export interface TaxRuleMatchRequest {
  taxType: TaxType;
  classificationKey: string;
  chargeCategory: ChargeCategory | null;
  accommodationType: AccommodationType | null;
  propertyClassification: PropertyClassification | null;
  jurisdiction: string;
  country: string;
  asOf: Date;
  seasonMonth: number;
  floorAreaSqm: number | null;
  tenantId: string;
}

export type TaxRuleResolver = (request: TaxRuleMatchRequest) => TaxRule;
