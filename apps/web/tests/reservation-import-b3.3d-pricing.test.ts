import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminFetch } from "@/lib/admin/api";
import {
  updateReservationImportMissingPriceStrategy,
  updateReservationImportRowDecision,
  type ReservationImportRowDto,
} from "@/lib/admin/reservation-import-api";
import {
  RESERVATION_IMPORT_MANUAL_CURRENCY_DEFAULT,
  RESERVATION_IMPORT_MANUAL_PRICE_FIELD,
  RESERVATION_IMPORT_TALOS_UNAVAILABLE,
  RESERVATION_IMPORT_USE_TALOS_ALL_MISSING_LABEL,
  RESERVATION_IMPORT_USE_TALOS_PRICE_LABEL,
} from "@/features/reservation-import/reservation-import-copy";
import {
  countEligibleUnresolvedPrices,
  priceDisplayLabel,
  priceDisplayKind,
  rowAllowsPriceDecision,
  rowHasHardBlockers,
  rowHasTalosPriceUnavailable,
  rowNeedsPriceDecision,
  validateManualImportTotalAmount,
} from "@/features/reservation-import/reservation-import-review-utils";

const root = join(__dirname, "..");
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function row(partial: Partial<ReservationImportRowDto> = {}): ReservationImportRowDto {
  return {
    id: partial.id ?? "row-1",
    tenantId: "t1",
    batchId: "b1",
    rowNumber: partial.rowNumber ?? 1,
    sourceNamespace: "csv_reservation_import",
    externalReference: "REF-1",
    unitId: "unit-aaa-bbbb-cccc-dddddddddddd",
    checkIn: "2026-11-10",
    checkOut: "2026-11-14",
    temporalClass: partial.temporalClass ?? "future",
    guestName: "Ada",
    guestEmail: "a@b.co",
    guestPhone: null,
    guestCount: 2,
    priceSource: partial.priceSource ?? "unresolved",
    importedTotalAmount: partial.importedTotalAmount ?? null,
    importedCurrency: partial.importedCurrency ?? null,
    operatorTotalAmount: partial.operatorTotalAmount ?? null,
    operatorCurrency: partial.operatorCurrency ?? null,
    conflictResolution: partial.conflictResolution ?? "undecided",
    replaceBookingId: null,
    replaceBookingIds: [],
    conflictSnapshot: partial.conflictSnapshot ?? {
      version: 1,
      existingBookingIds: [],
      peerImportRowIds: [],
      nonBookingBlockers: [],
      overlaps: [],
    },
    conflictGroupId: null,
    recheckRequired: false,
    status: partial.status ?? "pending",
    createdBookingId: null,
    supersededBookingId: null,
    errorCode: partial.errorCode ?? null,
    errorMessage: partial.errorMessage ?? null,
    payload: {},
    processedAt: null,
    createdAt: "2026-10-04T08:00:00.000Z",
    updatedAt: "2026-10-04T08:00:00.000Z",
    ...partial,
  };
}

vi.mock("@/lib/admin/api", () => ({
  adminFetch: vi.fn(),
  AdminApiError: class AdminApiError extends Error {
    constructor(
      public code: string,
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
}));

describe("B3.3d — missing price decision UI", () => {
  afterEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("imported CSV price displays and has no price-decision prompt", () => {
    const r = row({
      priceSource: "imported_csv",
      importedTotalAmount: "100.00",
      importedCurrency: "EUR",
      status: "ready",
    });
    expect(priceDisplayLabel(priceDisplayKind(r))).toBe("Τιμή CSV");
    expect(rowNeedsPriceDecision(r)).toBe(false);
  });

  it("unresolved price displays correct controls", () => {
    expect(rowNeedsPriceDecision(row({ priceSource: "unresolved" }))).toBe(true);
    const panel = read(
      "features/reservation-import/ReservationImportPriceDecisionPanel.tsx",
    );
    expect(panel).toContain("RESERVATION_IMPORT_USE_TALOS_PRICE_LABEL");
    expect(panel).toContain("RESERVATION_IMPORT_MANUAL_PRICE_LABEL");
    expect(RESERVATION_IMPORT_USE_TALOS_PRICE_LABEL).toBe("Χρήση τιμής TALOS");
  });

  it("single-row TALOS action posts priceSource talos_calculated", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce({
      row: row({ priceSource: "talos_calculated", operatorTotalAmount: "150.0000" }),
    });
    await updateReservationImportRowDecision("t1", "b1", "row-1", {
      priceSource: "talos_calculated",
    });
    expect(adminFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/rows\/row-1$/),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ priceSource: "talos_calculated" }),
      }),
    );
  });

  it("hook refetches GET after price mutations", () => {
    const hook = read("features/reservation-import/useReservationImportReview.ts");
    expect(hook).toContain("setRowPrice");
    expect(hook).toContain("setMissingPriceStrategy");
    expect(hook).toMatch(
      /await updateReservationImportRowDecision[\s\S]*await refetch\(\)/,
    );
    expect(hook).toMatch(
      /await updateReservationImportMissingPriceStrategy[\s\S]*await refetch\(\)/,
    );
  });

  it("TALOS-all-missing batch action", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce({ batch: {}, rows: [] });
    await updateReservationImportMissingPriceStrategy("t1", "b1", "talos_for_all_missing");
    expect(adminFetch).toHaveBeenCalledWith(
      expect.stringContaining("/reservation-imports/b1"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ missingPriceStrategy: "talos_for_all_missing" }),
      }),
    );
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("RESERVATION_IMPORT_USE_TALOS_ALL_MISSING_LABEL");
    expect(RESERVATION_IMPORT_USE_TALOS_ALL_MISSING_LABEL).toContain(
      "όλες τις κρατήσεις χωρίς τιμή",
    );
  });

  it("batch action hidden when no unresolved eligible prices", () => {
    expect(
      countEligibleUnresolvedPrices([
        row({ priceSource: "imported_csv", status: "ready" }),
        row({ id: "2", priceSource: "talos_calculated", status: "ready" }),
      ]),
    ).toBe(0);
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("unresolvedEligible > 0");
  });

  it("multiple missing rows counted for batch", () => {
    expect(
      countEligibleUnresolvedPrices([
        row({ id: "1", priceSource: "unresolved" }),
        row({ id: "2", priceSource: "unresolved" }),
        row({ id: "3", priceSource: "imported_csv", importedTotalAmount: "1", importedCurrency: "EUR" }),
      ]),
    ).toBe(2);
  });

  it("manual total price dialog copy and EUR default", () => {
    const panel = read(
      "features/reservation-import/ReservationImportPriceDecisionPanel.tsx",
    );
    expect(panel).toContain("RESERVATION_IMPORT_MANUAL_PRICE_FIELD");
    expect(RESERVATION_IMPORT_MANUAL_PRICE_FIELD).toBe("Συνολική τιμή κράτησης");
    expect(RESERVATION_IMPORT_MANUAL_CURRENCY_DEFAULT).toBe("EUR");
    expect(panel).toContain("RESERVATION_IMPORT_MANUAL_CURRENCY_DEFAULT");
  });

  it("client rejects zero/negative/malformed manual amounts", () => {
    expect(validateManualImportTotalAmount("")).toBe("required");
    expect(validateManualImportTotalAmount("0")).toBe("non_positive");
    expect(validateManualImportTotalAmount("-1")).toBe("malformed");
    expect(validateManualImportTotalAmount("abc")).toBe("malformed");
    expect(validateManualImportTotalAmount("12.50")).toBeNull();
  });

  it("edit operator-entered and switch TALOS→manual supported in panel", () => {
    const panel = read(
      "features/reservation-import/ReservationImportPriceDecisionPanel.tsx",
    );
    expect(panel).toContain('priceSource === "operator_entered"');
    expect(panel).toContain('priceSource === "talos_calculated"');
    expect(panel).toContain("RESERVATION_IMPORT_MANUAL_PRICE_EDIT");
  });

  it("TALOS failure surfaces manual fallback copy", () => {
    const r = row({
      priceSource: "unresolved",
      errorCode: "TALOS_PRICE_UNAVAILABLE",
      errorMessage: "TALOS could not calculate a price for this stay",
    });
    expect(rowHasTalosPriceUnavailable(r)).toBe(true);
    expect(RESERVATION_IMPORT_TALOS_UNAVAILABLE).toContain("χειροκίνητα");
  });

  it("historical row remains price-eligible", () => {
    expect(
      rowAllowsPriceDecision(
        row({ temporalClass: "historical", priceSource: "unresolved", status: "pending" }),
      ),
    ).toBe(true);
  });

  it("hard-blocked / skipped / terminal rows have no pricing controls", () => {
    expect(
      rowAllowsPriceDecision(
        row({
          status: "failed",
          conflictSnapshot: {
            version: 1,
            existingBookingIds: [],
            peerImportRowIds: [],
            nonBookingBlockers: [
              { blockType: "maintenance", checkIn: "2026-12-01", checkOut: "2026-12-03" },
            ],
            overlaps: [],
          },
        }),
      ),
    ).toBe(false);
    expect(rowHasHardBlockers(
      row({
        status: "failed",
        conflictSnapshot: {
          version: 1,
          existingBookingIds: [],
          peerImportRowIds: [],
          nonBookingBlockers: [
            { blockType: "owner", checkIn: "a", checkOut: "b" },
          ],
          overlaps: [],
        },
      }),
    )).toBe(true);
    expect(rowAllowsPriceDecision(row({ status: "skipped" }))).toBe(false);
    expect(rowAllowsPriceDecision(row({ status: "skipped_already_imported" }))).toBe(false);
    expect(rowAllowsPriceDecision(row({ status: "imported" }))).toBe(false);
    expect(rowAllowsPriceDecision(row({ status: "replaced" }))).toBe(false);
    expect(rowAllowsPriceDecision(row({ status: "discarded" }))).toBe(false);
  });

  it("conflict and pricing remain independent in page wiring", () => {
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("onDecideConflict");
    expect(page).toContain("onUseTalosPrice");
    expect(page).toContain("onSaveManualPrice");
    expect(page).not.toMatch(/keep_csv.*talos_calculated|talos_calculated.*keep_csv/);
  });

  it("duplicate pricing submission prevented via busy flags", () => {
    const hook = read("features/reservation-import/useReservationImportReview.ts");
    expect(hook).toContain("pricingRowId");
    expect(hook).toContain("pricingBatch");
    expect(hook).toContain("pricingBusy");
    const panel = read(
      "features/reservation-import/ReservationImportPriceDecisionPanel.tsx",
    );
    expect(panel).toContain("controlsDisabled");
  });

  it("PATCH/refetch failure architecture preserved", () => {
    const hook = read("features/reservation-import/useReservationImportReview.ts");
    expect(hook).toContain('phase: "patch"');
    expect(hook).toContain('phase: "refetch"');
    expect(hook).toContain("setRefetchFailed(true)");
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("RESERVATION_IMPORT_PRICE_ERROR");
    expect(page).toContain("RESERVATION_IMPORT_REFETCH_AFTER_DECISION_ERROR");
  });

  it("mobile structure uses stacked panel + dialog", () => {
    const panel = read(
      "features/reservation-import/ReservationImportPriceDecisionPanel.tsx",
    );
    expect(panel).toContain("flex-wrap");
    expect(panel).toContain("Dialog");
    expect(panel).toContain("max-w-md");
  });

  it("accessibility labels and live status", () => {
    const panel = read(
      "features/reservation-import/ReservationImportPriceDecisionPanel.tsx",
    );
    expect(panel).toContain("aria-label");
    expect(panel).toContain('htmlFor={`manual-price-${row.id}`}');
    expect(panel).toContain('role="status"');
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain('aria-live="polite"');
  });

  it("Phase C2 commit remains gated outside pricing panels", () => {
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("RESERVATION_IMPORT_COMMIT_LABEL");
    expect(page).toContain("evaluateClientCommitEligibility");
    expect(page).not.toContain("RESERVATION_IMPORT_PHASE_C_PLACEHOLDER");
    const panel = read(
      "features/reservation-import/ReservationImportPriceDecisionPanel.tsx",
    );
    expect(panel).not.toContain("RESERVATION_IMPORT_COMMIT_LABEL");
  });
});
