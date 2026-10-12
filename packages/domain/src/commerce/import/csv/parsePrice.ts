import { Money } from "../../shared/value-objects/Money";
import type { CsvImportPriceState } from "./types";

/**
 * Villa/vacation-rental CSV import policy: missing currency defaults to EUR.
 *
 * Extension point: pass `defaultCurrency` from `property.policies.defaultCurrency`
 * at draft-create time. Do not use this for OTA API payloads, payments, invoices,
 * or fiscal documents — those keep their explicitly declared currencies.
 */
export const CSV_IMPORT_DEFAULT_CURRENCY = "EUR";

export function resolveCsvImportDefaultCurrency(
  propertyDefaultCurrency?: string | null,
): string {
  const raw = (propertyDefaultCurrency ?? "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(raw)) return raw;
  return CSV_IMPORT_DEFAULT_CURRENCY;
}

/**
 * Parse optional imported total. Missing price is valid (unresolved later).
 * Missing/empty currency resolves to the villa CSV default (EUR, or property base).
 * Explicit invalid currency is rejected — never silently overridden.
 */
export function parseCsvImportPrice(
  rawAmount: string | null | undefined,
  rawCurrency: string | null | undefined,
  options?: { defaultCurrency?: string | null },
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

  const fallback = resolveCsvImportDefaultCurrency(options?.defaultCurrency);
  const currencyText = (rawCurrency ?? "").trim();
  let currency: string;
  let currencyDefaulted = false;
  if (!currencyText) {
    currency = fallback;
    currencyDefaulted = true;
  } else {
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
    const money = Money.create(normalizedAmount, currency);
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
      currency: money.currency,
      currencyDefaulted,
      readyForImportedCsvQuote: true,
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
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
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
