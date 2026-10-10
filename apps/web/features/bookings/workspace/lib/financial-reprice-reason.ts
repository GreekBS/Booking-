import { FinancialRepriceValidationError } from "./financial-reprice-errors";

/** Matches `@hcp/validators` preview/apply reason constraints. */
export const FINANCIAL_REPRICE_REASON_MIN = 3;
export const FINANCIAL_REPRICE_REASON_MAX = 500;

export function normalizeFinancialRepriceReason(reason: string): string {
  return reason.trim();
}

export function validateFinancialRepriceReason(reason: string): string {
  const normalized = normalizeFinancialRepriceReason(reason);
  if (normalized.length < FINANCIAL_REPRICE_REASON_MIN) {
    throw new FinancialRepriceValidationError(
      `Ο λόγος πρέπει να έχει τουλάχιστον ${FINANCIAL_REPRICE_REASON_MIN} χαρακτήρες.`,
    );
  }
  if (normalized.length > FINANCIAL_REPRICE_REASON_MAX) {
    throw new FinancialRepriceValidationError(
      `Ο λόγος δεν μπορεί να υπερβαίνει τους ${FINANCIAL_REPRICE_REASON_MAX} χαρακτήρες.`,
    );
  }
  return normalized;
}
