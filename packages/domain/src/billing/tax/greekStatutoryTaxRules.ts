import { TaxRule } from "./TaxRule";
import type { PropertyClassification, TaxRuleProps } from "./TaxRule";

/**
 * Verified Greek statutory TaxRule seeds (platform_statutory).
 *
 * Sources:
 * - VAT rates: AADE Basic VAT rates (24% / 13% / 6%); tourist accommodation → 13%
 * - Island reduced VAT architecture: jurisdiction GR-ISLAND-REDUCED with 30% cut
 *   (24→17, 13→9, 6→4) per AADE E.2113/2025 / Art. 26 VAT Code — eligibility is
 *   assigned on BusinessFiscalProfile.jurisdiction, NOT guessed in TaxEngine.
 * - Climate Resilience Fee 2025 matrix: Law 5177/2025 Art. 44 + AADE TELΟΣ form
 *   high season Apr–Oct; low season Nov–Mar.
 *
 * Do NOT seed obsolete myDATA historical fee values that conflict with 2025 law.
 */

const NOW = new Date("2025-01-01T00:00:00.000Z");
const VAT_SOURCE = "AADE Basic VAT rates; Appendix III VAT Code (tourist accommodation 13%)";
const ISLAND_VAT_SOURCE =
  "AADE E.2113/2025; VAT Code Art. 26 (30% reduction) — jurisdiction assigned on profile";
const CLIMATE_SOURCE = "Law 5177/2025 Art. 44; AADE Climate Resilience Fee statement form 2025-02";
const CLIMATE_VERSION = "2025-L5177-Art44";

const HIGH = [4, 5, 6, 7, 8, 9, 10];
const LOW = [11, 12, 1, 2, 3];

function base(partial: Omit<TaxRuleProps, "createdAt" | "updatedAt">): TaxRule {
  return TaxRule.create({
    ...partial,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function vatRule(input: {
  id: string;
  jurisdiction: string;
  chargeCategory: TaxRuleProps["chargeCategory"];
  rate: string;
  legalSource: string;
  legalVersion: string;
}): TaxRule {
  return base({
    id: input.id,
    tenantId: null,
    scope: "platform_statutory",
    country: "GR",
    jurisdiction: input.jurisdiction,
    taxType: "vat",
    classificationKey: `vat:${input.chargeCategory}`,
    chargeCategory: input.chargeCategory,
    accommodationType: null,
    propertyClassification: null,
    calculationKind: "PERCENTAGE",
    ratePercent: input.rate,
    fixedAmount: null,
    currency: "EUR",
    basis: "NET",
    validFrom: new Date("2016-06-01T00:00:00.000Z"),
    validUntil: null,
    season: null,
    floorAreaMinSqm: null,
    floorAreaMaxExclusiveSqm: null,
    legalSource: input.legalSource,
    legalVersion: input.legalVersion,
    priority: 100,
  });
}

function climateRule(input: {
  id: string;
  classification: PropertyClassification;
  accommodationType: TaxRuleProps["accommodationType"];
  amount: string;
  months: number[];
  floorAreaMinSqm?: number | null;
  floorAreaMaxExclusiveSqm?: number | null;
}): TaxRule {
  return base({
    id: input.id,
    tenantId: null,
    scope: "platform_statutory",
    country: "GR",
    // Climate fee is national — same rates regardless of island VAT jurisdiction.
    jurisdiction: "*",
    taxType: "climate_resilience_fee",
    classificationKey: `climate:${input.classification}`,
    chargeCategory: "accommodation",
    accommodationType: input.accommodationType,
    propertyClassification: input.classification,
    calculationKind: "FIXED_PER_ROOM",
    ratePercent: null,
    fixedAmount: input.amount,
    currency: "EUR",
    basis: "QUANTITY",
    validFrom: new Date("2025-01-01T00:00:00.000Z"),
    validUntil: null,
    season: { months: input.months },
    floorAreaMinSqm: input.floorAreaMinSqm ?? null,
    floorAreaMaxExclusiveSqm: input.floorAreaMaxExclusiveSqm ?? null,
    legalSource: CLIMATE_SOURCE,
    legalVersion: CLIMATE_VERSION,
    priority: 100,
  });
}

/** Climate rules match any GR jurisdiction code via wildcard handled in resolve. */
export function greekStatutoryTaxRules(): TaxRule[] {
  const rules: TaxRule[] = [];

  // --- Mainland / default GR VAT ---
  for (const [cat, rate] of [
    ["accommodation", "13.0000"],
    ["extra", "24.0000"],
    ["service", "24.0000"],
    ["fee", "24.0000"],
    ["food_beverage", "13.0000"],
    ["other", "24.0000"],
  ] as const) {
    rules.push(
      vatRule({
        id: `gr-vat-${cat}-mainland`,
        jurisdiction: "GR",
        chargeCategory: cat,
        rate,
        legalSource: VAT_SOURCE,
        legalVersion: "AADE-basic-rates",
      }),
    );
  }

  // --- Island reduced VAT jurisdiction (operator assigns GR-ISLAND-REDUCED) ---
  // 30% cut: 24→17, 13→9. Do not list islands here — profile carries jurisdiction.
  for (const [cat, rate] of [
    ["accommodation", "9.0000"],
    ["extra", "17.0000"],
    ["service", "17.0000"],
    ["fee", "17.0000"],
    ["food_beverage", "9.0000"],
    ["other", "17.0000"],
  ] as const) {
    rules.push(
      vatRule({
        id: `gr-vat-${cat}-island-reduced`,
        jurisdiction: "GR-ISLAND-REDUCED",
        chargeCategory: cat,
        rate,
        legalSource: ISLAND_VAT_SOURCE,
        legalVersion: "E.2113/2025",
      }),
    );
  }

  // --- Climate Resilience Fee 2025 matrix ---
  const climateMatrix: Array<{
    classification: PropertyClassification;
    accommodationType: TaxRuleProps["accommodationType"];
    high: string;
    low: string;
    floorAreaMinSqm?: number | null;
    floorAreaMaxExclusiveSqm?: number | null;
  }> = [
    {
      classification: "hotel_stars_1_2",
      accommodationType: "hotel",
      high: "2.0000",
      low: "0.5000",
    },
    {
      classification: "hotel_stars_3",
      accommodationType: "hotel",
      high: "5.0000",
      low: "1.5000",
    },
    {
      classification: "hotel_stars_4",
      accommodationType: "hotel",
      high: "10.0000",
      low: "3.0000",
    },
    {
      classification: "hotel_stars_5",
      accommodationType: "hotel",
      high: "15.0000",
      low: "4.0000",
    },
    {
      classification: "furnished_rooms_apartments",
      accommodationType: "furnished_rooms_apartments",
      high: "2.0000",
      low: "0.5000",
    },
    // Size thresholds are encoded in classificationKey — operator selects the
    // correct classification on BusinessFiscalProfile (no silent geography/size guess).
    {
      classification: "short_term_rental",
      accommodationType: "short_term_rental",
      high: "8.0000",
      low: "2.0000",
    },
    {
      classification: "short_term_rental_detached_gt_80sqm",
      accommodationType: "short_term_rental",
      high: "15.0000",
      low: "4.0000",
    },
    {
      classification: "villa_self_catering",
      accommodationType: "villa_self_catering",
      high: "15.0000",
      low: "4.0000",
    },
    {
      classification: "tourist_furnished_house_lt_80sqm",
      accommodationType: "tourist_furnished_house",
      high: "8.0000",
      low: "2.0000",
    },
    {
      classification: "tourist_furnished_house_gte_80sqm",
      accommodationType: "tourist_furnished_house",
      high: "15.0000",
      low: "4.0000",
    },
  ];

  for (const row of climateMatrix) {
    rules.push(
      climateRule({
        id: `gr-climate-${row.classification}-high-2025`,
        classification: row.classification,
        accommodationType: row.accommodationType,
        amount: row.high,
        months: HIGH,
        floorAreaMinSqm: row.floorAreaMinSqm,
        floorAreaMaxExclusiveSqm: row.floorAreaMaxExclusiveSqm,
      }),
      climateRule({
        id: `gr-climate-${row.classification}-low-2025`,
        classification: row.classification,
        accommodationType: row.accommodationType,
        amount: row.low,
        months: LOW,
        floorAreaMinSqm: row.floorAreaMinSqm,
        floorAreaMaxExclusiveSqm: row.floorAreaMaxExclusiveSqm,
      }),
    );
  }

  return rules;
}
