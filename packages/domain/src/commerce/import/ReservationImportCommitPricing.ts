import { ValidationError } from "../../shared/errors/DomainError";
import { Money } from "../shared/value-objects/Money";
import type { QuotePricingMode } from "../shared/types/CommerceTypes";
import { normalizeOperatorEnteredImportPrice } from "./ReservationImportOperatorPrice";
import type { ReservationImportRowRecord } from "./ReservationImportTypes";

export interface FrozenImportCommitPrice {
  amount: string;
  currency: string;
  pricingMode: QuotePricingMode;
}

/**
 * Resolve frozen draft pricing for commit — never reprices via StayPricingEngine.
 */
export function resolveFrozenImportCommitPrice(
  row: ReservationImportRowRecord,
): FrozenImportCommitPrice {
  switch (row.priceSource) {
    case "imported_csv": {
      if (
        row.importedTotalAmount == null ||
        String(row.importedTotalAmount).trim() === "" ||
        row.importedCurrency == null ||
        String(row.importedCurrency).trim() === ""
      ) {
        throw new ValidationError(
          `Row ${row.rowNumber}: imported_csv price is missing amount or currency`,
        );
      }
      const money = Money.create(row.importedTotalAmount, row.importedCurrency);
      if (money.isZero() || money.isNegative()) {
        throw new ValidationError(
          `Row ${row.rowNumber}: imported_csv total must be positive`,
        );
      }
      return {
        amount: money.amount,
        currency: money.currency,
        pricingMode: "imported_csv",
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
