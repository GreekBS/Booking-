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
  TaxComponentSnapshot,
  TaxContext,
  TaxEvaluation,
  TaxLineInput,
} from "./TaxTypes";

function monthOf(date: Date): number {
  return date.getUTCMonth() + 1;
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
    seasonMonth: monthOf(ctx.asOf),
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

function evaluateClimateFee(
  catalog: readonly TaxRule[],
  ctx: TaxContext,
): TaxComponentSnapshot {
  if (ctx.nightCount < 0 || ctx.roomOrApartmentCount < 1) {
    throw new ValidationError("Invalid climate fee quantities");
  }

  const classification = climateClassification(
    ctx.accommodationType,
    ctx.propertyClassification,
  );

  const rule = resolveTaxRule(catalog, {
    taxType: "climate_resilience_fee",
    classificationKey: `climate:${classification}`,
    chargeCategory: "accommodation",
    accommodationType: ctx.accommodationType,
    propertyClassification: classification,
    jurisdiction: ctx.jurisdiction,
    country: ctx.country,
    asOf: ctx.asOf,
    seasonMonth: monthOf(ctx.asOf),
    floorAreaSqm: ctx.floorAreaSqm,
    tenantId: ctx.tenantId,
  });

  if (rule.currency !== ctx.currency) {
    throw new ValidationError("Climate fee TaxRule currency mismatch");
  }
  if (!rule.fixedAmount) {
    throw new ValidationError(`Climate fee rule ${rule.id} requires fixedAmount`);
  }

  const totalDailyUses = ctx.nightCount * ctx.roomOrApartmentCount;
  const complimentaryDailyUses = ctx.complimentaryStay ? totalDailyUses : 0;
  const taxableDailyUses = totalDailyUses - complimentaryDailyUses;

  const unit = Money.create(rule.fixedAmount, ctx.currency);
  let amount = Money.zero(ctx.currency);
  if (taxableDailyUses > 0) {
    // FIXED_PER_ROOM / per daily use: unit × taxableDailyUses
    amount = unit.multiplyByRatio(BigInt(taxableDailyUses), 1n);
  }

  return buildComponent(rule, amount, null, null, {
    totalDailyUses,
    complimentaryDailyUses,
    taxableDailyUses,
    complimentaryStay: ctx.complimentaryStay,
    nightCount: ctx.nightCount,
    roomOrApartmentCount: ctx.roomOrApartmentCount,
    requiresSeparateFiscalDocument: true,
    fiscalDocumentKindHint: "climate_resilience_fee_special_element",
  });
}

/**
 * Country-agnostic TaxEngine.
 * Greek specifics live in TaxRule catalog data, not in conditionals here.
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

    // Climate Resilience Fee is a distinct levy — evaluated once per stay context
    // when accommodation type is in scope (hotel / STR / villa / furnished).
    if (shouldEvaluateClimate(context.accommodationType)) {
      components.push(evaluateClimateFee(rules, context));
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
