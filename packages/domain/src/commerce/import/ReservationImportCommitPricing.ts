import { ValidationError } from "../../shared/errors/DomainError";
import { Money } from "../shared/value-objects/Money";
import type { QuotePricingMode } from "../shared/types/CommerceTypes";
import {
  CSV_IMPORT_DEFAULT_CURRENCY,
  resolveCsvImportDefaultCurrency,
} from "./csv/parsePrice";
import { normalizeOperatorEnteredImportPrice } from "./ReservationImportOperatorPrice";
import type { ReservationImportRowRecord } from "./ReservationImportTypes";

export interface FrozenImportCommitPrice {
  amount: string;
  /** Always a concrete ISO currency for commit (villa CSV missing → EUR). */
  currency: string;
  pricingMode: QuotePricingMode;
  /** True when missing CSV currency was resolved via villa EUR/default policy. */
  currencyDefaulted?: boolean;
}

/**
 * Resolve frozen draft pricing for commit — never reprices via StayPricingEngine.
 *
 * Villa/vacation-rental CSV policy: missing/empty `importedCurrency` resolves to
 * {@link CSV_IMPORT_DEFAULT_CURRENCY} (EUR), or an optional property base currency.
 * Explicit invalid codes are rejected. Operator/TALOS paths always freeze a currency.
 *
 * Readiness and commit must call this same helper so missing currency never
 * blocks an otherwise valid row.
 */
export function resolveFrozenImportCommitPrice(
  row: ReservationImportRowRecord,
  options?: { defaultCurrency?: string | null },
): FrozenImportCommitPrice {
  switch (row.priceSource) {
    case "imported_csv": {
      if (
        row.importedTotalAmount == null ||
        String(row.importedTotalAmount).trim() === ""
      ) {
        throw new ValidationError(
          `Row ${row.rowNumber}: imported_csv price is missing amount`,
        );
      }
      const fallback = resolveCsvImportDefaultCurrency(options?.defaultCurrency);
      const currencyRaw =
        row.importedCurrency == null || String(row.importedCurrency).trim() === ""
          ? null
          : String(row.importedCurrency).trim().toUpperCase();
      let currency: string;
      let currencyDefaulted = false;
      if (currencyRaw == null) {
        currency = fallback;
        currencyDefaulted = true;
      } else if (!/^[A-Z]{3}$/.test(currencyRaw)) {
        throw new ValidationError(
          `Row ${row.rowNumber}: imported_csv currency is invalid`,
        );
      } else {
        currency = currencyRaw;
      }

      let amount: string;
      try {
        const money = Money.create(row.importedTotalAmount, currency);
        if (money.isZero() || money.isNegative()) {
          throw new ValidationError("Imported total must be positive");
        }
        amount = money.amount;
      } catch (error) {
        throw new ValidationError(
          error instanceof Error
            ? `Row ${row.rowNumber}: ${error.message}`
            : `Row ${row.rowNumber}: imported_csv amount is invalid`,
        );
      }
      return {
        amount,
        currency,
        pricingMode: "imported_csv",
        ...(currencyDefaulted ? { currencyDefaulted: true } : {}),
      };
    }
    case "operator_entered": {
      const normalized = normalizeOperatorEnteredImportPrice({
        amount: row.operatorTotalAmount,
        currency: row.operatorCurrency,
      });
      return {
        amount: normalized.amount,
        currency: normalized.currency,
        pricingMode: "operator_entered",
      };
    }
    case "talos_calculated": {
      if (
        row.operatorTotalAmount == null ||
        String(row.operatorTotalAmount).trim() === "" ||
        row.operatorCurrency == null ||
        String(row.operatorCurrency).trim() === ""
      ) {
        throw new ValidationError(
          `Row ${row.rowNumber}: talos_calculated price is missing frozen amount or currency`,
        );
      }
      const money = Money.create(row.operatorTotalAmount, row.operatorCurrency);
      if (money.isZero() || money.isNegative()) {
        throw new ValidationError(
          `Row ${row.rowNumber}: talos_calculated total must be positive`,
        );
      }
      return {
        amount: money.amount,
        currency: money.currency,
        pricingMode: "talos_calculated",
      };
    }
    default:
      throw new ValidationError(
        `Row ${row.rowNumber}: unresolved price cannot be committed`,
      );
  }
}

export { CSV_IMPORT_DEFAULT_CURRENCY };
