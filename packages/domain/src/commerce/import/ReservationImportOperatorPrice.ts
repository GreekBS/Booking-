import { ValidationError } from "../../shared/errors/DomainError";
import { Money } from "../shared/value-objects/Money";

/** Default currency for operator-entered import totals (B3.3d product decision). */
export const RESERVATION_IMPORT_MANUAL_PRICE_DEFAULT_CURRENCY = "EUR";

/**
 * Authoritative validation for operator-entered import totals.
 * Reuses Money — rejects missing, malformed, non-finite, zero, and negative amounts.
 */
export function normalizeOperatorEnteredImportPrice(input: {
  amount: string | null | undefined;
  currency?: string | null | undefined;
}): { amount: string; currency: string } {
  if (input.amount == null || String(input.amount).trim() === "") {
    throw new ValidationError("Operator-entered total amount is required");
  }

  const raw = String(input.amount).trim();
  if (!Number.isFinite(Number(raw.replace(",", ".")))) {
    throw new ValidationError(`Invalid money amount: ${input.amount}`);
  }

  const currencyRaw =
    input.currency == null || String(input.currency).trim() === ""
      ? RESERVATION_IMPORT_MANUAL_PRICE_DEFAULT_CURRENCY
      : String(input.currency).trim();

  const money = Money.create(raw.replace(",", "."), currencyRaw);
  if (money.isZero() || money.isNegative()) {
    throw new ValidationError("Operator-entered total must be positive");
  }

  return { amount: money.amount, currency: money.currency };
}
