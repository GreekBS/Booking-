import { ValidationError } from "../../shared/errors/DomainError";
import { Money } from "../shared/value-objects/Money";
import type { QuotePricingMode } from "../shared/types/CommerceTypes";
import type { Folio, FolioLine } from "../../billing/domain/Folio";
import {
  BOOKING_COMMERCIAL_AMENDMENT_SOURCE_TYPE,
  COMMERCIAL_AMENDMENT_FISCAL_COVERAGE_MESSAGE,
  COMMERCIAL_AMENDMENT_FOLIO_CLOSED_MESSAGE,
  listAccommodationFolioLines,
} from "../../billing/application/commercialAmendmentFolioAdjustment";
import { computeFolioLineCoverage } from "../../fiscal/documents/FiscalAllocation";
import type { FiscalLineAllocation } from "../../fiscal/documents/FiscalAllocation";
import {
  assertCommercialFeeTaxPolicyA,
  assertPricingModeAllowsAutomaticRatePlanReprice,
} from "./commercialRepriceSafety";

export const COMMERCIAL_AMENDMENT_ZERO_DELTA_MESSAGE =
  "Financial reprice rejected: proposed total equals the current agreed total (no-op)";

export const COMMERCIAL_AMENDMENT_MISSING_FOLIO_ACTIVITY_MESSAGE =
  "Financial reprice rejected: primary folio is missing but payments or fiscal allocations exist";

export const COMMERCIAL_AMENDMENT_FOLIO_BASELINE_MESSAGE =
  "Financial reprice rejected: legacy folio commercial baseline cannot be reconciled safely";

export const COMMERCIAL_AMENDMENT_FOLIO_CONCURRENT_MESSAGE =
  "Financial reprice rejected: primary folio changed concurrently; retry confirmation";

export const COMMERCIAL_AMENDMENT_IDEMPOTENCY_CONFLICT_MESSAGE =
  "Financial reprice rejected: confirmation was already used with a different commercial payload";

/**
 * Fail-closed quote/commercial checks shared by preview and apply (no writes).
 */
export function assertFinancialRepriceQuoteGuards(input: {
  pricingMode: QuotePricingMode | undefined | null;
  currentFeesAmount: string;
  currentTaxesAmount: string;
  proposedFeesAmount: string;
  proposedTaxesAmount: string;
  currency: string;
  currentTotalAmount: string;
  proposedTotalAmount: string;
}): void {
  assertPricingModeAllowsAutomaticRatePlanReprice(input.pricingMode);
  assertCommercialFeeTaxPolicyA({
    feesAmount: input.currentFeesAmount,
    taxesAmount: input.currentTaxesAmount,
    currency: input.currency,
  });
  assertCommercialFeeTaxPolicyA({
    feesAmount: input.proposedFeesAmount,
    taxesAmount: input.proposedTaxesAmount,
    currency: input.currency,
  });

  const current = Money.create(input.currentTotalAmount, input.currency);
  const proposed = Money.create(input.proposedTotalAmount, input.currency);
  if (current.amount === proposed.amount) {
    throw new ValidationError(COMMERCIAL_AMENDMENT_ZERO_DELTA_MESSAGE);
  }
}

/** True when any accommodation line has non-zero issued fiscal allocation. */
export function accommodationHasFiscalCoverage(
  folio: Folio,
  allocations: readonly FiscalLineAllocation[],
): boolean {
  for (const line of listAccommodationFolioLines(folio)) {
    const coverage = computeFolioLineCoverage(
      line.id,
      line.amount,
      folio.currency,
      allocations,
    );
    if (coverage.status !== "unfiscalized") {
      return true;
    }
  }
  return false;
}

/**
 * Baseline = Σ accommodation + Σ prior commercial amendment adjustments.
 * Must equal the booking's current agreed total (fail closed on drift).
 */
export function assertFolioCommercialBaselineReconciles(input: {
  folio: Folio;
  expectedAgreedTotal: string;
}): void {
  let baseline = Money.zero(input.folio.currency);
  for (const line of input.folio.lines) {
    if (contributesToCommercialBaseline(line)) {
      baseline = baseline.add(
        Money.create(line.amount, input.folio.currency),
      );
    }
  }
  const expected = Money.create(
    input.expectedAgreedTotal,
    input.folio.currency,
  );
  if (baseline.amount !== expected.amount) {
    throw new ValidationError(COMMERCIAL_AMENDMENT_FOLIO_BASELINE_MESSAGE);
  }
}

function contributesToCommercialBaseline(line: FolioLine): boolean {
  if (line.lineType === "accommodation") return true;
  return (
    line.lineType === "adjustment" &&
    line.source.sourceType === BOOKING_COMMERCIAL_AMENDMENT_SOURCE_TYPE
  );
}

/**
 * Folio / payment / fiscal fail-closed rules for apply (read-only evaluation).
 * Does not mutate folio, payments, or fiscal rows.
 */
export function assertFinancialRepriceFolioGuards(input: {
  primaryFolio: Folio | null;
  paymentCount: number;
  fiscalAllocationCount: number;
  expectedAgreedTotal: string;
  allocationsOnPrimary: readonly FiscalLineAllocation[];
}): void {
  if (!input.primaryFolio) {
    if (input.paymentCount > 0 || input.fiscalAllocationCount > 0) {
      throw new ValidationError(
        COMMERCIAL_AMENDMENT_MISSING_FOLIO_ACTIVITY_MESSAGE,
      );
    }
    return;
  }

  if (input.primaryFolio.status === "closed") {
    throw new ValidationError(COMMERCIAL_AMENDMENT_FOLIO_CLOSED_MESSAGE);
  }

  if (
    accommodationHasFiscalCoverage(
      input.primaryFolio,
      input.allocationsOnPrimary,
    )
  ) {
    throw new ValidationError(COMMERCIAL_AMENDMENT_FISCAL_COVERAGE_MESSAGE);
  }

  assertFolioCommercialBaselineReconciles({
    folio: input.primaryFolio,
    expectedAgreedTotal: input.expectedAgreedTotal,
  });
}
