import { ValidationError } from "../../shared/errors/DomainError";
import { Money } from "../shared/value-objects/Money";
import type { QuotePricingMode } from "../shared/types/CommerceTypes";

/**
 * BFS-3 Policy A — fail closed when commercial fees/taxes cannot be recalculated.
 * RatePlan pricing today has no fee/tax engine; non-zero snapshot fees/taxes block reprice.
 */
export const COMMERCIAL_FEE_TAX_POLICY_A_MESSAGE =
  "Financial reprice rejected: existing commercial fees or taxes cannot be recalculated (Policy A fail-closed)";

export const IMPORTED_OPERATOR_REPRICE_BLOCK_MESSAGE =
  "Financial reprice rejected: imported_csv and operator_entered bookings require explicit conversion confirmation (not automatic talos_calculated)";

export function assertCommercialFeeTaxPolicyA(input: {
  feesAmount: string;
  taxesAmount: string;
  currency: string;
}): void {
  const fees = Money.create(input.feesAmount, input.currency);
  const taxes = Money.create(input.taxesAmount, input.currency);
  if (!fees.isZero() || !taxes.isZero()) {
    throw new ValidationError(COMMERCIAL_FEE_TAX_POLICY_A_MESSAGE);
  }
}

/**
 * Imported / operator-entered provenance must not silently become talos_calculated.
 * BFS-3b may allow an explicit conversion path with auditable amendment later.
 */
export function assertPricingModeAllowsAutomaticRatePlanReprice(
  pricingMode: QuotePricingMode | undefined | null,
): void {
  const mode = pricingMode ?? "talos_calculated";
  if (mode === "imported_csv" || mode === "operator_entered") {
    throw new ValidationError(IMPORTED_OPERATOR_REPRICE_BLOCK_MESSAGE);
  }
  if (mode !== "talos_calculated") {
    throw new ValidationError(
      `Financial reprice rejected: unsupported pricing mode ${String(mode)}`,
    );
  }
}
