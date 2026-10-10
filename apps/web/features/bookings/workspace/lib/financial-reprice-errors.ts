import { AdminApiError } from "@/lib/admin/api";

/** Stable operator-facing classification for financial reprice failures. */
export type FinancialRepriceErrorKind =
  | "forbidden"
  | "unauthorized"
  | "token_invalid"
  | "stale"
  | "reason_mismatch"
  | "folio_closed"
  | "fiscal_coverage"
  | "folio_baseline"
  | "folio_missing_activity"
  | "policy_a"
  | "pricing_mode"
  | "zero_delta"
  | "folio_concurrent"
  | "idempotency_conflict"
  | "unavailable"
  | "validation"
  | "network"
  | "unknown";

export interface FinancialRepriceMappedError {
  kind: FinancialRepriceErrorKind;
  /** Greek operator copy — never includes tokens or stack traces. */
  message: string;
  /**
   * True when the same in-memory confirmation may be retried
   * (ambiguous network / gateway failure after apply was sent).
   */
  retryableWithSameToken: boolean;
  /** True when the operator must request a fresh preview. */
  requiresNewPreview: boolean;
}

const FALLBACK_MESSAGE =
  "Η προσαρμογή τιμής δεν ολοκληρώθηκε. Δοκιμάστε ξανά.";

const NETWORK_MESSAGE =
  "Αποτυχία σύνδεσης. Αν η ενέργεια μπορεί να ολοκληρώθηκε, δοκιμάστε ξανά την επιβεβαίωση χωρίς νέα προεπισκόπηση.";

type Matcher = {
  kind: FinancialRepriceErrorKind;
  test: (message: string, code: string, status: number) => boolean;
  message: string;
  retryableWithSameToken?: boolean;
  requiresNewPreview?: boolean;
};

const MATCHERS: readonly Matcher[] = [
  {
    kind: "unauthorized",
    test: (_m, code, status) => status === 401 || code === "UNAUTHORIZED",
    message: "Η συνεδρία δεν είναι έγκυρη. Συνδεθείτε ξανά.",
    requiresNewPreview: true,
  },
  {
    kind: "forbidden",
    test: (_m, code, status) => status === 403 || code === "FORBIDDEN",
    message: "Δεν έχετε δικαίωμα προσαρμογής της συμφωνημένης τιμής.",
    requiresNewPreview: true,
  },
  {
    kind: "token_invalid",
    test: (m) =>
      m.includes("confirmation token is invalid or expired") ||
      m.includes("confirmation token does not match this booking") ||
      m.includes("confirmation token was issued for a different operator") ||
      m.includes("confirmation token does not match this property"),
    message:
      "Η επιβεβαίωση έληξε ή δεν είναι έγκυρη. Ζητήστε νέα προεπισκόπηση.",
    requiresNewPreview: true,
  },
  {
    kind: "reason_mismatch",
    test: (m) => m.includes("confirmation reason does not match preview"),
    message:
      "Ο λόγος δεν ταιριάζει με την προεπισκόπηση. Ξεκινήστε ξανά την προεπισκόπηση.",
    requiresNewPreview: true,
  },
  {
    kind: "stale",
    test: (m) => m.includes("confirmation is stale"),
    message:
      "Η κράτηση ή η τιμολόγηση άλλαξε μετά την προεπισκόπηση. Ζητήστε νέα προεπισκόπηση.",
    requiresNewPreview: true,
  },
  {
    kind: "folio_closed",
    test: (m) => m.includes("primary folio is closed"),
    message: "Ο λογαριασμός (folio) είναι κλειστός. Δεν επιτρέπεται προσαρμογή τιμής.",
    requiresNewPreview: true,
  },
  {
    kind: "fiscal_coverage",
    test: (m) =>
      m.includes("fiscally allocated") || m.includes("credit-note workflow"),
    message:
      "Υπάρχουν εκδοθέντα φορολογικά έγγραφα για τη διαμονή. Απαιτείται διαδικασία πιστωτικού.",
    requiresNewPreview: true,
  },
  {
    kind: "folio_baseline",
    test: (m) =>
      m.includes("legacy folio commercial baseline cannot be reconciled"),
    message:
      "Ο λογαριασμός δεν μπορεί να συμφιλιωθεί με ασφάλεια. Επικοινωνήστε με υποστήριξη.",
    requiresNewPreview: true,
  },
  {
    kind: "folio_missing_activity",
    test: (m) =>
      m.includes("primary folio is missing but payments or fiscal"),
    message:
      "Υπάρχουν πληρωμές ή φορολογικές εγγραφές χωρίς κύριο λογαριασμό. Δεν επιτρέπεται προσαρμογή.",
    requiresNewPreview: true,
  },
  {
    kind: "policy_a",
    test: (m) =>
      m.includes("fees or taxes cannot be recalculated") ||
      m.includes("policy a"),
    message:
      "Τα τέλη ή οι φόροι της προσφοράς δεν μπορούν να υπολογιστούν αυτόματα από το RatePlan.",
    requiresNewPreview: true,
  },
  {
    kind: "pricing_mode",
    test: (m) =>
      m.includes("imported_csv") ||
      m.includes("operator_entered") ||
      m.includes("unsupported pricing mode"),
    message:
      "Η προέλευση τιμής αυτής της κράτησης δεν επιτρέπει αυτόματη προσαρμογή από RatePlan.",
    requiresNewPreview: true,
  },
  {
    kind: "zero_delta",
    test: (m) =>
      m.includes("proposed total equals the current agreed total") ||
      m.includes("(no-op)"),
    message: "Η προτεινόμενη τιμή είναι ίδια με την τρέχουσα. Δεν υπάρχει αλλαγή.",
    requiresNewPreview: true,
  },
  {
    kind: "folio_concurrent",
    test: (m) =>
      m.includes("primary folio changed concurrently") ||
      m.includes("retry confirmation"),
    message:
      "Ο λογαριασμός άλλαξε ταυτόχρονα. Επαναλάβετε την προεπισκόπηση και την επιβεβαίωση.",
    requiresNewPreview: true,
  },
  {
    kind: "idempotency_conflict",
    test: (m, code) =>
      m.includes("already used with a different commercial payload") ||
      code === "IDEMPOTENCY_CONFLICT",
    message:
      "Η επιβεβαίωση χρησιμοποιήθηκε ήδη με διαφορετικά στοιχεία. Ξεκινήστε νέα προεπισκόπηση.",
    requiresNewPreview: true,
  },
  {
    kind: "unavailable",
    test: (m) =>
      m.includes("not available for financial reprice") ||
      m.includes("rate plan not configured") ||
      m.includes("stay is not available"),
    message:
      "Δεν είναι δυνατή η τιμολόγηση από RatePlan για αυτή τη διαμονή.",
    requiresNewPreview: true,
  },
  {
    kind: "validation",
    test: (_m, code, status) => status === 400 || code === "VALIDATION_ERROR",
    message: "Τα στοιχεία της αίτησης δεν είναι έγκυρα. Ελέγξτε τον λόγο και δοκιμάστε ξανά.",
    requiresNewPreview: true,
  },
];

function isNetworkLike(error: unknown): boolean {
  if (error instanceof AdminApiError) {
    return error.status >= 502 && error.status <= 504;
  }
  if (error instanceof TypeError) return true;
  if (error instanceof Error) {
    const m = error.message.toLowerCase();
    return (
      m.includes("failed to fetch") ||
      m.includes("networkerror") ||
      m.includes("network request failed") ||
      m.includes("load failed")
    );
  }
  return false;
}

/**
 * Map API / network failures to safe Greek operator copy.
 * Never echoes tokens, stack traces, or raw internal payloads.
 */
export function mapFinancialRepriceError(
  error: unknown,
): FinancialRepriceMappedError {
  if (isNetworkLike(error)) {
    const retryableWithSameToken =
      !(error instanceof AdminApiError) ||
      (error.status >= 502 && error.status <= 504);
    return {
      kind: "network",
      message: NETWORK_MESSAGE,
      retryableWithSameToken,
      requiresNewPreview: !retryableWithSameToken,
    };
  }

  if (error instanceof FinancialRepriceValidationError) {
    return {
      kind: "validation",
      message: error.message,
      retryableWithSameToken: false,
      requiresNewPreview: false,
    };
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    const message = error.message.toLowerCase();
    const code = error instanceof AdminApiError ? error.code : "";
    const status = error instanceof AdminApiError ? error.status : 0;
    for (const matcher of MATCHERS) {
      if (matcher.test(message, code, status)) {
        return {
          kind: matcher.kind,
          message: matcher.message,
          retryableWithSameToken: matcher.retryableWithSameToken ?? false,
          requiresNewPreview: matcher.requiresNewPreview ?? true,
        };
      }
    }
  }

  return {
    kind: "unknown",
    message: FALLBACK_MESSAGE,
    retryableWithSameToken: false,
    requiresNewPreview: true,
  };
}

export class FinancialRepriceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinancialRepriceValidationError";
  }
}
