import { ConflictError, ValidationError } from "../../shared/errors/DomainError";
import type { TaxRule } from "./TaxRule";
import type { TaxRuleMatchRequest } from "./TaxTypes";

/**
 * Deterministic TaxRule resolution.
 *
 * Precedence:
 * 1. Filter effective-dated + jurisdiction/country/classification/season/size matches
 * 2. Platform statutory rules always win over tenant commercial for the same
 *    taxType+classificationKey (tenant cannot casually override statutory Greek tax)
 * 3. Among remaining, highest priority wins
 * 4. Ambiguous (2+ equal priority same scope) → fail closed
 * 5. Missing → fail closed
 */
export function resolveTaxRule(
  catalog: readonly TaxRule[],
  request: TaxRuleMatchRequest,
): TaxRule {
  const candidates = catalog.filter((rule) => matchesRequest(rule, request));

  if (candidates.length === 0) {
    throw new ValidationError(
      `No TaxRule for ${request.taxType}/${request.classificationKey} ` +
        `jurisdiction=${request.jurisdiction} asOf=${request.asOf.toISOString()}`,
    );
  }

  const statutory = candidates.filter((r) => r.scope === "platform_statutory");
  const pool = statutory.length > 0 ? statutory : candidates.filter(
    (r) => r.scope === "tenant_commercial" && r.tenantId === request.tenantId,
  );

  if (pool.length === 0) {
    throw new ValidationError(
      `No applicable TaxRule scope for ${request.taxType}/${request.classificationKey}`,
    );
  }

  const maxPriority = Math.max(...pool.map((r) => r.priority));
  const top = pool.filter((r) => r.priority === maxPriority);
  if (top.length > 1) {
    throw new ConflictError(
      `Ambiguous TaxRules for ${request.taxType}/${request.classificationKey}: ` +
        top.map((r) => r.id).join(", "),
      "tax_rule_ambiguous",
    );
  }
  return top[0]!;
}

function matchesRequest(rule: TaxRule, request: TaxRuleMatchRequest): boolean {
  if (rule.taxType !== request.taxType) return false;
  if (rule.classificationKey !== request.classificationKey) return false;
  if (rule.country !== request.country.toUpperCase()) return false;
  // "*" = national levy applies in every local VAT jurisdiction (e.g. climate fee).
  if (rule.jurisdiction !== "*" && rule.jurisdiction !== request.jurisdiction) {
    return false;
  }
  if (!rule.isEffectiveOn(request.asOf)) return false;
  if (!rule.matchesSeasonMonth(request.seasonMonth)) return false;
  if (!rule.matchesFloorArea(request.floorAreaSqm)) return false;

  if (rule.chargeCategory != null && request.chargeCategory != null) {
    if (rule.chargeCategory !== request.chargeCategory) return false;
  } else if (rule.chargeCategory != null && request.chargeCategory == null) {
    return false;
  }

  if (rule.accommodationType != null) {
    if (rule.accommodationType !== request.accommodationType) return false;
  }
  if (rule.propertyClassification != null) {
    if (rule.propertyClassification !== request.propertyClassification) return false;
  }

  if (rule.scope === "tenant_commercial") {
    if (rule.tenantId !== request.tenantId) return false;
  }

  return true;
}
