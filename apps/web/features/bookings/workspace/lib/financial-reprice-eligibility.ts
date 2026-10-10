import type { QuoteRecord } from "@/lib/admin/types";

export type FinancialRepricePricingMode =
  QuoteRecord["pricingMode"];

export type FinancialRepriceEligibilityBlockReason =
  | "unauthorized"
  | "dirty_stay"
  | "terminal_status"
  | "incompatible_status"
  | "unknown_pricing_mode"
  | "imported_csv"
  | "operator_entered"
  | "unsupported_pricing_mode"
  | "missing_quote";

export interface FinancialRepriceEligibility {
  /** Show the financial-reprice entry point at all (permission UX gate). */
  visible: boolean;
  /** Whether the operator may open the dialog / start preview. */
  enabled: boolean;
  blockReason: FinancialRepriceEligibilityBlockReason | null;
  /** Greek operator-facing explanation when disabled or unsupported. */
  message: string | null;
}

const TERMINAL = new Set(["cancelled", "completed"]);
const COMPATIBLE = new Set(["pending", "payment_pending", "confirmed"]);

export function pricingModeBlockMessage(
  pricingMode: FinancialRepricePricingMode,
): { reason: FinancialRepriceEligibilityBlockReason; message: string } | null {
  if (pricingMode === "talos_calculated") return null;
  if (pricingMode == null) {
    return {
      reason: "unknown_pricing_mode",
      message:
        "Η προέλευση τιμής αυτής της κράτησης δεν είναι γνωστή (παλαιά εγγραφή). Δεν επιτρέπεται αυτόματη προσαρμογή από RatePlan.",
    };
  }
  if (pricingMode === "imported_csv") {
    return {
      reason: "imported_csv",
      message:
        "Η τιμή προήλθε από εισαγωγή (CSV). Δεν επιτρέπεται αυτόματη προσαρμογή από RatePlan.",
    };
  }
  if (pricingMode === "operator_entered") {
    return {
      reason: "operator_entered",
      message:
        "Η τιμή καταχωρήθηκε χειροκίνητα. Δεν επιτρέπεται αυτόματη προσαρμογή από RatePlan.",
    };
  }
  return {
    reason: "unsupported_pricing_mode",
    message:
      "Η προέλευση τιμής αυτής της κράτησης δεν επιτρέπει αυτόματη προσαρμογή από RatePlan.",
  };
}

export function lifecycleBlockMessage(
  status: string,
): { reason: FinancialRepriceEligibilityBlockReason; message: string } | null {
  if (TERMINAL.has(status)) {
    return {
      reason: "terminal_status",
      message:
        "Η κράτηση είναι σε τελική κατάσταση. Δεν επιτρέπεται προσαρμογή συμφωνημένης τιμής.",
    };
  }
  if (!COMPATIBLE.has(status)) {
    return {
      reason: "incompatible_status",
      message:
        "Η τρέχουσα κατάσταση κράτησης δεν επιτρέπει προσαρμογή συμφωνημένης τιμής.",
    };
  }
  return null;
}

export function evaluateFinancialRepriceEligibility(input: {
  canAdjust: boolean;
  stayDirty: boolean;
  bookingStatus: string | null | undefined;
  pricingMode: FinancialRepricePricingMode | undefined;
  hasQuote: boolean;
}): FinancialRepriceEligibility {
  if (!input.canAdjust) {
    return {
      visible: false,
      enabled: false,
      blockReason: "unauthorized",
      message: null,
    };
  }

  if (!input.hasQuote || input.pricingMode === undefined) {
    return {
      visible: true,
      enabled: false,
      blockReason: "missing_quote",
      message: "Η προσφορά δεν είναι διαθέσιμη για προσαρμογή τιμής.",
    };
  }

  const pricingBlock = pricingModeBlockMessage(input.pricingMode);
  if (pricingBlock) {
    return {
      visible: true,
      enabled: false,
      blockReason: pricingBlock.reason,
      message: pricingBlock.message,
    };
  }

  const lifeBlock = lifecycleBlockMessage(input.bookingStatus ?? "");
  if (lifeBlock) {
    return {
      visible: true,
      enabled: false,
      blockReason: lifeBlock.reason,
      message: lifeBlock.message,
    };
  }

  if (input.stayDirty) {
    return {
      visible: true,
      enabled: false,
      blockReason: "dirty_stay",
      message:
        "Αποθηκεύστε ή ακυρώστε τις μη αποθηκευμένες αλλαγές διαμονής πριν την προσαρμογή τιμής.",
    };
  }

  return {
    visible: true,
    enabled: true,
    blockReason: null,
    message: null,
  };
}
