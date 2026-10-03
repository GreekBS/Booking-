import { Money } from "../../shared/value-objects/Money";
import type { CsvImportPriceState } from "./types";

const DEFAULT_CURRENCY_WHEN_MISSING = "EUR";

/**
 * Parse optional imported total. Missing price is valid (unresolved later).
 * Does not FX-convert or compare to property currency.
 */
export function parseCsvImportPrice(
  rawAmount: string | null | undefined,
  rawCurrency: string | null | undefined,
): CsvImportPriceState {
  const amountText = (rawAmount ?? "").trim();
  if (!amountText) {
    return { status: "missing" };
  }

  const normalizedAmount = normalizeAmountToken(amountText);
  if (!normalizedAmount) {
    return {
      status: "invalid",
      raw: amountText,
      reason: "Unrecognized amount format",
    };
  }

  const currencyText = (rawCurrency ?? "").trim();
  let currency: string | null = null;
  if (currencyText) {
    const upper = currencyText.toUpperCase();
    if (!/^[A-Z]{3}$/.test(upper)) {
      return {
        status: "invalid",
        raw: amountText,
        reason: `Invalid currency code: ${currencyText}`,
      };
    }
    currency = upper;
  }

  try {
    const money = Money.create(
      normalizedAmount,
      currency ?? DEFAULT_CURRENCY_WHEN_MISSING,
    );
    if (money.isZero() || money.isNegative()) {
      return {
        status: "invalid",
        raw: amountText,
        reason: "Imported total must be positive",
      };
    }
    return {
      status: "present",
      amount: money.amount,
      currency,
      // Ready only when currency known; otherwise B2/B3 may supply currency
      readyForImportedCsvQuote: currency != null,
    };
  } catch (error) {
    return {
      status: "invalid",
      raw: amountText,
      reason: error instanceof Error ? error.message : "Invalid money",
    };
  }
}

/**
 * Accept `1234.56`, `1234,56`, `1.234,56`, `1,234.56`, optional leading currency symbols.
 */
function normalizeAmountToken(raw: string): string | null {
  let s = raw.trim();
  // Strip common currency symbols / codes glued to number
  s = s.replace(/^[€$£]\s*/u, "");
  s = s.replace(/\s*[€$£]$/u, "");
  s = s.replace(/^[A-Za-z]{3}\s+/u, "");
  s = s.replace(/\s+[A-Za-z]{3}$/u, "");
  s = s.replace(/\s+/g, "");

  if (!/^-?\d([\d.,]*\d)?$|^-?\d$/.test(s)) {
    return null;
  }

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Last separator is decimal
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // Could be thousands or decimal — if exactly one comma with 1-2 digits after, decimal
    const parts = s.split(",");
    if (parts.length === 2 && parts[1]!.length <= 2) {
      s = `${parts[0]}.${parts[1]}`;
    } else {
      s = s.replace(/,/g, "");
    }
  }

  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    return null;
  }
  return s;
}
