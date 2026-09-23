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
  /** From BusinessFiscalProfile — never inferred by TaxEngine. */
  jurisdiction: string;
  currency: string;
  /** Evaluation instant for effective-dated rules. */
  asOf: Date;
  accommodationType: AccommodationType;
  propertyClassification: PropertyClassification | null;
  /** Floor area sqm when size-gated climate rules apply. */
  floorAreaSqm: number | null;
  /** Stay nights / daily uses (calendar nights). */
  nightCount: number;
  roomOrApartmentCount: number;
  guestCount: number;
  /** Complimentary/free stay → climate levy amount 0; uses still counted. */
  complimentaryStay: boolean;
  amountBasis: "NET" | "GROSS";
  lines: TaxLineInput[];
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
