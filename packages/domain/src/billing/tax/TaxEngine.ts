import { Money } from "../../commerce/shared/value-objects/Money";
import { ValidationError } from "../../shared/errors/DomainError";
import type { TaxRule } from "./TaxRule";
import type {
  PropertyClassification,
  AccommodationType,
} from "./TaxRule";
import { resolveTaxRule } from "./resolveTaxRule";
import { vatFromGross, vatFromNet } from "./VatConversion";
import type {
  ClimateDailyUseSnapshot,
  TaxComponentSnapshot,
  TaxContext,
  TaxEvaluation,
  TaxLineInput,
} from "./TaxTypes";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function monthOfUtcDate(date: Date): number {
  return date.getUTCMonth() + 1;
}

function parseLocalDateUtcNoon(ymd: string): Date {
  if (!DATE_RE.test(ymd)) {
    throw new ValidationError(`Invalid stay night date: ${ymd}`);
  }
  return new Date(`${ymd}T12:00:00.000Z`);
}

function climateClassification(
  accommodationType: AccommodationType,
  propertyClassification: PropertyClassification | null,
): PropertyClassification {
  if (propertyClassification && propertyClassification !== "unclassified") {
    return propertyClassification;
  }
  throw new ValidationError(
    "Climate Resilience Fee requires propertyClassification on BusinessFiscalProfile",
  );
}

function buildComponent(
  rule: TaxRule,
  amount: Money,
  taxableBase: string | null,
  sourceLineId: string | null,
  metadata: TaxComponentSnapshot["metadata"],
): TaxComponentSnapshot {
  return {
    taxType: rule.taxType,
    classificationKey: rule.classificationKey,
    calculationKind: rule.calculationKind,
    appliedRatePercent: rule.ratePercent,
    appliedFixedAmount: rule.fixedAmount,
    taxableBase,
    calculatedAmount: amount.amount,
    currency: amount.currency,
    ruleId: rule.id,
    ruleScope: rule.scope,
    ruleValidFrom: rule.validFrom.toISOString(),
    ruleValidUntil: rule.validUntil ? rule.validUntil.toISOString() : null,
    jurisdiction: rule.jurisdiction,
    chargeCategory: rule.chargeCategory,
    legalSource: rule.legalSource,
    legalVersion: rule.legalVersion,
    sourceLineId,
    metadata,
  };
}

function evaluateVatForLine(
  catalog: readonly TaxRule[],
  ctx: TaxContext,
  line: TaxLineInput,
): TaxComponentSnapshot {
  const classificationKey = `vat:${line.chargeCategory}`;
  const rule = resolveTaxRule(catalog, {
    taxType: "vat",
    classificationKey,
    chargeCategory: line.chargeCategory,
    accommodationType: ctx.accommodationType,
    propertyClassification: ctx.propertyClassification,
    jurisdiction: ctx.jurisdiction,
    country: ctx.country,
    asOf: ctx.asOf,
    seasonMonth: monthOfUtcDate(ctx.asOf),
    floorAreaSqm: ctx.floorAreaSqm,
    tenantId: ctx.tenantId,
  });

  if (rule.calculationKind !== "PERCENTAGE" || !rule.ratePercent) {
    throw new ValidationError(`VAT rule ${rule.id} must be PERCENTAGE`);
  }
  if (rule.currency !== ctx.currency) {
    throw new ValidationError("TaxRule currency mismatch");
  }

  const vat =
    ctx.amountBasis === "NET"
      ? vatFromNet(line.amount, rule.ratePercent)
      : vatFromGross(line.amount, rule.ratePercent);

  return buildComponent(rule, vat, line.amount.amount, line.lineId, {
    amountBasis: ctx.amountBasis,
    requiresSeparateFiscalDocument: false,
    fiscalDocumentKindHint: null,
  });
}

/**
 * Climate Resilience Fee: one evaluation per daily use (date × room).
 * Seasonal / effective-date boundaries are resolved per stay night — never as a
 * single season for the whole reservation.
 */
function evaluateClimateFeeDailyUses(
  catalog: readonly TaxRule[],
  ctx: TaxContext,
): TaxComponentSnapshot[] {
  if (ctx.roomOrApartmentCount < 1) {
    throw new ValidationError("Invalid climate fee roomOrApartmentCount");
  }
  if (!ctx.stayNightDates || ctx.stayNightDates.length === 0) {
    throw new ValidationError(
      "stayNightDates required for Climate Resilience Fee daily-use evaluation",
    );
  }

  const classification = climateClassification(
    ctx.accommodationType,
    ctx.propertyClassification,
  );

  const complimentarySet = new Set(
    ctx.complimentaryNightDates ??
      (ctx.complimentaryStay ? ctx.stayNightDates : []),
  );

  const dailyUses: ClimateDailyUseSnapshot[] = [];
  const components: TaxComponentSnapshot[] = [];
  let totalDailyUses = 0;
  let complimentaryDailyUses = 0;
  let taxableDailyUses = 0;

  for (const date of ctx.stayNightDates) {
    const asOf = parseLocalDateUtcNoon(date);
    const seasonMonth = monthOfUtcDate(asOf);
    const complimentaryNight = complimentarySet.has(date);

    const rule = resolveTaxRule(catalog, {
      taxType: "climate_resilience_fee",
      classificationKey: `climate:${classification}`,
      chargeCategory: "accommodation",
      accommodationType: ctx.accommodationType,
      propertyClassification: classification,
      jurisdiction: ctx.jurisdiction,
      country: ctx.country,
      asOf,
      seasonMonth,
      floorAreaSqm: ctx.floorAreaSqm,
      tenantId: ctx.tenantId,
    });

    if (rule.currency !== ctx.currency) {
      throw new ValidationError("Climate fee TaxRule currency mismatch");
    }
    if (!rule.fixedAmount) {
      throw new ValidationError(`Climate fee rule ${rule.id} requires fixedAmount`);
    }

    for (let roomIndex = 0; roomIndex < ctx.roomOrApartmentCount; roomIndex++) {
      totalDailyUses += 1;
      const complimentary = complimentaryNight || ctx.complimentaryStay;
      if (complimentary) complimentaryDailyUses += 1;
      else taxableDailyUses += 1;

      const unit = Money.create(rule.fixedAmount, ctx.currency);
      const amount = complimentary ? Money.zero(ctx.currency) : unit;

      const daily: ClimateDailyUseSnapshot = {
        date,
        roomIndex,
        complimentary,
        ruleId: rule.id,
        ruleValidFrom: rule.validFrom.toISOString(),
        ruleValidUntil: rule.validUntil ? rule.validUntil.toISOString() : null,
        appliedFixedAmount: rule.fixedAmount,
        calculatedAmount: amount.amount,
        seasonMonth,
      };
      dailyUses.push(daily);

      components.push(
        buildComponent(rule, amount, null, `climate:${date}:r${roomIndex}`, {
          totalDailyUses: 1,
          complimentaryDailyUses: complimentary ? 1 : 0,
          taxableDailyUses: complimentary ? 0 : 1,
          complimentaryStay: complimentary,
          nightCount: 1,
          roomOrApartmentCount: 1,
          dailyUses: [daily],
          requiresSeparateFiscalDocument: true,
          fiscalDocumentKindHint: "climate_resilience_fee_special_element",
        }),
      );
    }
  }

  // Attach roll-up on first climate component for Folio/UI convenience without
  // collapsing per-day components (each remains a first-class snapshot).
  if (components[0]) {
    components[0] = {
      ...components[0],
      metadata: {
        ...components[0].metadata,
        totalDailyUses,
        complimentaryDailyUses,
        taxableDailyUses,
        nightCount: ctx.stayNightDates.length,
        roomOrApartmentCount: ctx.roomOrApartmentCount,
        dailyUses,
      },
    };
  }

  return components;
}

/**
 * Country-agnostic TaxEngine.
 * Greek geographic legislation belongs in jurisdiction resolver/catalog — not here.
 */
export class TaxEngine {
  evaluate(context: TaxContext, rules: readonly TaxRule[]): TaxEvaluation {
    if (!context.jurisdiction.trim()) {
      throw new ValidationError("TaxContext.jurisdiction required");
    }
    if (context.currency.trim().length !== 3) {
      throw new ValidationError("TaxContext.currency required");
    }
    if (context.lines.some((l) => l.amount.currency !== context.currency)) {
      throw new ValidationError("Tax line currency mismatch");
    }

    const components: TaxComponentSnapshot[] = [];

    for (const line of context.lines) {
      components.push(evaluateVatForLine(rules, context, line));
    }

    if (shouldEvaluateClimate(context.accommodationType)) {
      components.push(...evaluateClimateFeeDailyUses(rules, context));
    }

    let vatTotal = Money.zero(context.currency);
    let levyTotal = Money.zero(context.currency);
    for (const c of components) {
      const m = Money.create(c.calculatedAmount, c.currency);
      if (c.taxType === "vat") vatTotal = vatTotal.add(m);
      else levyTotal = levyTotal.add(m);
    }
    const taxTotal = vatTotal.add(levyTotal);

    return {
      currency: context.currency,
      jurisdiction: context.jurisdiction,
      asOf: context.asOf.toISOString(),
      components,
      vatTotal: vatTotal.amount,
      levyTotal: levyTotal.amount,
      taxTotal: taxTotal.amount,
      appliedRuleIds: [...new Set(components.map((c) => c.ruleId))],
    };
  }
}

function shouldEvaluateClimate(type: AccommodationType): boolean {
  return (
    type === "hotel" ||
    type === "furnished_rooms_apartments" ||
    type === "short_term_rental" ||
    type === "villa_self_catering" ||
    type === "tourist_furnished_house"
  );
}

export const taxEngine = new TaxEngine();
