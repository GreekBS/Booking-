import { describe, expect, it } from "vitest";
import { AdminApiError } from "@/lib/admin/api";
import {
  FinancialRepriceValidationError,
  mapFinancialRepriceError,
} from "@/features/bookings/workspace/lib/financial-reprice-errors";
import {
  validateFinancialRepriceReason,
} from "@/features/bookings/workspace/lib/financial-reprice-reason";

describe("BFS-4 financial reprice error mapping", () => {
  it("maps forbidden and unauthorized", () => {
    expect(
      mapFinancialRepriceError(new AdminApiError("FORBIDDEN", "Forbidden", 403))
        .kind,
    ).toBe("forbidden");
    expect(
      mapFinancialRepriceError(
        new AdminApiError("UNAUTHORIZED", "Unauthorized", 401),
      ).kind,
    ).toBe("unauthorized");
  });

  it("maps token expiry and stale confirmation", () => {
    expect(
      mapFinancialRepriceError(
        new AdminApiError(
          "VALIDATION_ERROR",
          "Confirmation token is invalid or expired",
          400,
        ),
      ).kind,
    ).toBe("token_invalid");
    expect(
      mapFinancialRepriceError(
        new AdminApiError(
          "VALIDATION_ERROR",
          "Confirmation is stale: booking quote or agreed total changed since preview",
          400,
        ),
      ).kind,
    ).toBe("stale");
  });

  it("maps folio, fiscal, policy A, pricing mode, zero delta", () => {
    expect(
      mapFinancialRepriceError(
        new AdminApiError(
          "VALIDATION_ERROR",
          "Commercial amendment rejected: primary folio is closed",
          400,
        ),
      ).kind,
    ).toBe("folio_closed");
    expect(
      mapFinancialRepriceError(
        new AdminApiError(
          "VALIDATION_ERROR",
          "Commercial amendment rejected: accommodation charges are fiscally allocated; credit-note workflow required",
          400,
        ),
      ).kind,
    ).toBe("fiscal_coverage");
    expect(
      mapFinancialRepriceError(
        new AdminApiError(
          "VALIDATION_ERROR",
          "Financial reprice rejected: legacy folio commercial baseline cannot be reconciled safely",
          400,
        ),
      ).kind,
    ).toBe("folio_baseline");
    expect(
      mapFinancialRepriceError(
        new AdminApiError(
          "VALIDATION_ERROR",
          "Financial reprice rejected: existing commercial fees or taxes cannot be recalculated (Policy A fail-closed)",
          400,
        ),
      ).kind,
    ).toBe("policy_a");
    expect(
      mapFinancialRepriceError(
        new AdminApiError(
          "VALIDATION_ERROR",
          "Financial reprice rejected: imported_csv and operator_entered bookings require explicit conversion confirmation (not automatic talos_calculated)",
          400,
        ),
      ).kind,
    ).toBe("pricing_mode");
    expect(
      mapFinancialRepriceError(
        new AdminApiError(
          "VALIDATION_ERROR",
          "Financial reprice rejected: proposed total equals the current agreed total (no-op)",
          400,
        ),
      ).kind,
    ).toBe("zero_delta");
  });

  it("maps concurrent folio and idempotency conflict", () => {
    expect(
      mapFinancialRepriceError(
        new AdminApiError(
          "VALIDATION_ERROR",
          "Financial reprice rejected: primary folio changed concurrently; retry confirmation",
          400,
        ),
      ).kind,
    ).toBe("folio_concurrent");
    expect(
      mapFinancialRepriceError(
        new AdminApiError(
          "IDEMPOTENCY_CONFLICT",
          "Financial reprice rejected: confirmation was already used with a different commercial payload",
          409,
        ),
      ).kind,
    ).toBe("idempotency_conflict");
  });

  it("marks ambiguous network failures as retryable with same token", () => {
    const mapped = mapFinancialRepriceError(new TypeError("Failed to fetch"));
    expect(mapped.kind).toBe("network");
    expect(mapped.retryableWithSameToken).toBe(true);
    expect(mapped.requiresNewPreview).toBe(false);
    expect(mapped.message).not.toMatch(/token-/i);
  });

  it("does not expose raw tokens in mapped messages", () => {
    const mapped = mapFinancialRepriceError(
      new AdminApiError(
        "VALIDATION_ERROR",
        "Confirmation token is invalid or expired: token-secret-value",
        400,
      ),
    );
    expect(mapped.message).not.toContain("token-secret-value");
  });

  it("validates reason length against backend constraints", () => {
    expect(() => validateFinancialRepriceReason("ab")).toThrow(
      FinancialRepriceValidationError,
    );
    expect(validateFinancialRepriceReason("  ok enough  ")).toBe("ok enough");
    expect(() => validateFinancialRepriceReason("x".repeat(501))).toThrow(
      FinancialRepriceValidationError,
    );
  });
});
