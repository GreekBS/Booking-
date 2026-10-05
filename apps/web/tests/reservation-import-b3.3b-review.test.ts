import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminFetch } from "@/lib/admin/api";
import {
  getReservationImportDraft,
  recheckReservationImportDraft,
  updateReservationImportMissingPriceStrategy,
  updateReservationImportRowDecision,
} from "@/lib/admin/reservation-import-api";
import type { ReservationImportRowDto } from "@/lib/admin/reservation-import-api";
import {
  computeReadinessCounts,
  conflictBookingsForRow,
  filterRowsForTab,
  formatRowPriceAmount,
  isConflictTabRow,
  nonBookingBlockerLabel,
  peerRowsForRow,
  priceDisplayKind,
  priceDisplayLabel,
  tabCounts,
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
    checkOut: "2026-11-12",
    temporalClass: partial.temporalClass ?? "future",
    guestName: "Ada",
    guestEmail: "a@b.co",
    guestPhone: null,
    guestCount: 2,
    priceSource: partial.priceSource ?? "imported_csv",
    importedTotalAmount: partial.importedTotalAmount ?? "120.00",
    importedCurrency: partial.importedCurrency ?? "EUR",
    operatorTotalAmount: null,
    operatorCurrency: null,
    conflictResolution: partial.conflictResolution ?? "undecided",
    replaceBookingId: null,
    replaceBookingIds: partial.replaceBookingIds ?? [],
    conflictSnapshot: partial.conflictSnapshot ?? {
      version: 1,
      existingBookingIds: [],
      peerImportRowIds: [],
      nonBookingBlockers: [],
      overlaps: [],
    },
    conflictGroupId: null,
    recheckRequired: false,
    status: partial.status ?? "ready",
    createdBookingId: null,
    supersededBookingId: null,
    errorCode: null,
    errorMessage: null,
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

describe("B3.3b — review utils & wiring", () => {
  afterEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("retains full GET detail in review hook (batch, rows, rejectedRows, conflictBookings)", () => {
    const hook = read("features/reservation-import/useReservationImportReview.ts");
    expect(hook).toContain("getReservationImportDraft");
    expect(hook).toContain("ReservationImportDraftDetail");
    expect(hook).toContain("detail");
    expect(hook).not.toMatch(/rows\.length\s*[,}]/);
  });

  it("defaults conflictBookings when API omits field", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce({
      batch: { id: "b1", expiresAt: "2026-10-07T08:00:00.000Z" },
      rows: [],
      rejectedRows: [],
    });
    const detail = await getReservationImportDraft("t1", "b1");
    expect(detail.conflictBookings).toEqual([]);
  });

  it("readiness counts derive from backend row statuses only", () => {
    const rows = [
      row({ id: "1", status: "ready" }),
      row({ id: "2", status: "pending" }),
      row({ id: "3", status: "failed" }),
      row({ id: "4", status: "skipped" }),
      row({ id: "5", status: "skipped_already_imported" }),
    ];
    expect(computeReadinessCounts(rows, [{ id: "r", rowNumber: 9 } as never])).toEqual({
      accepted: 5,
      ready: 1,
      skipped: 2,
      needAction: 2,
      rejected: 1,
    });
  });

  it("tab filters without mutating statuses", () => {
    const rows = [
      row({ id: "ready", status: "ready" }),
      row({ id: "pending", status: "pending" }),
      row({
        id: "conflict",
        status: "pending",
        conflictSnapshot: {
          version: 1,
          existingBookingIds: ["bk-1"],
          peerImportRowIds: [],
          nonBookingBlockers: [],
          overlaps: [],
        },
      }),
    ];
    expect(filterRowsForTab("all", rows)).toHaveLength(3);
    expect(filterRowsForTab("action", rows).map((r) => r.id).sort()).toEqual(
      ["conflict", "pending"].sort(),
    );
    expect(filterRowsForTab("ready", rows).map((r) => r.id)).toEqual(["ready"]);
    expect(filterRowsForTab("conflicts", rows).map((r) => r.id)).toEqual(["conflict"]);
    expect(tabCounts(rows, []).conflicts).toBe(1);
  });

  it("no-conflict ready row is not in conflicts tab", () => {
    const r = row({ status: "ready" });
    expect(isConflictTabRow(r)).toBe(false);
  });

  it("imported CSV price display", () => {
    const r = row({ priceSource: "imported_csv" });
    expect(priceDisplayLabel(priceDisplayKind(r))).toBe("Τιμή CSV");
    expect(formatRowPriceAmount(r)).toBe("120.00 EUR");
  });

  it("unresolved price display", () => {
    const r = row({
      priceSource: "unresolved",
      importedTotalAmount: null,
      importedCurrency: null,
    });
    expect(priceDisplayLabel(priceDisplayKind(r))).toBe("Χωρίς τιμή");
    expect(formatRowPriceAmount(r)).toBeNull();
  });

  it("historical label in row card source", () => {
    const card = read("features/reservation-import/ReservationImportReviewRowCard.tsx");
    expect(card).toContain('temporalClass === "historical"');
    expect(card).toContain("Ιστορική κράτηση");
  });

  it("single and multiple existing booking conflict join", () => {
    const b1 = {
      id: "550e8400-e29b-41d4-a716-446655440301",
      guestName: "One",
      checkIn: "2026-11-10",
      checkOut: "2026-11-12",
    };
    const b2 = {
      id: "550e8400-e29b-41d4-a716-446655440302",
      guestName: "Two",
      checkIn: "2026-11-11",
      checkOut: "2026-11-13",
    };
    const r = row({
      conflictSnapshot: {
        version: 1,
        existingBookingIds: [b1.id, b2.id],
        peerImportRowIds: [],
        nonBookingBlockers: [],
        overlaps: [{ otherKind: "existing_booking", otherId: b2.id, checkIn: "x", checkOut: "y" }],
      },
    });
    const joined = conflictBookingsForRow(r, [b1, b2]);
    expect(joined).toHaveLength(2);
    expect(joined.map((x) => x.guestName).sort()).toEqual(["One", "Two"]);
  });

  it("CSV peer conflict join", () => {
    const peer = row({ id: "peer", rowNumber: 2, guestName: "Peer", externalReference: "P-2" });
    const r = row({
      conflictSnapshot: {
        version: 1,
        existingBookingIds: [],
        peerImportRowIds: [peer.id],
        nonBookingBlockers: [],
        overlaps: [],
      },
    });
    expect(peerRowsForRow(r, [r, peer])).toEqual([peer]);
  });

  it("hard blocker Greek labels", () => {
    expect(nonBookingBlockerLabel("maintenance")).toBe("Συντήρηση");
    const panel = read(
      "features/reservation-import/ReservationImportConflictDecisionPanel.tsx",
    );
    expect(panel).toContain("Μη-κρατησιακό μπλοκ");
    expect(panel).toContain("rowAllowsConflictDecision");
  });

  it("rejected tab UI is read-only", () => {
    const rejected = read("features/reservation-import/ReservationImportRejectedRowCard.tsx");
    expect(rejected).not.toContain("PATCH");
    expect(rejected).not.toContain("localStorage");
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("Απορριφθείσες");
    expect(page).toContain("ReservationImportRejectedRowCard");
  });

  it("recheck helper posts then refetches authoritative GET", async () => {
    const hook = read("features/reservation-import/useReservationImportReview.ts");
    expect(hook).toContain("recheckReservationImportDraft");
    expect(hook).toMatch(/await recheckReservationImportDraft[\s\S]*await refetch\(\)/);

    vi.mocked(adminFetch).mockResolvedValueOnce({ batch: {}, rows: [] });
    await recheckReservationImportDraft("t1", "b1");
    expect(adminFetch).toHaveBeenCalledWith(
      expect.stringContaining("/recheck"),
      expect.objectContaining({ method: "POST", tenantId: "t1" }),
    );
  });

  it("typed mutation API helpers exist", async () => {
    vi.mocked(adminFetch).mockResolvedValue({ batch: {}, rows: [], row: row() });
    await updateReservationImportMissingPriceStrategy("t1", "b1", "per_row");
    await updateReservationImportRowDecision("t1", "b1", "row-1", {
      conflictResolution: "keep_csv",
    });
    expect(adminFetch).toHaveBeenCalledTimes(2);
  });

  it("expired and discard flows preserved in draft page", () => {
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain('state.kind === "expired"');
    expect(page).toContain("ConfirmDialog");
    expect(page).toContain("discard");
    expect(page).toContain("RESERVATION_IMPORT_DRAFT_TTL_MESSAGE");
  });

  it("API failure and not-found states preserved", () => {
    const hook = read("features/reservation-import/useReservationImportReview.ts");
    expect(hook).toContain("isReservationImportExpiredError");
    expect(hook).toContain("isReservationImportNotFoundError");
    expect(hook).toContain('kind: "error"');
  });

  it("unit label fallback when catalog fails", () => {
    const hook = read("features/reservation-import/useReservationImportReview.ts");
    expect(hook).toContain("fetchPropertyUnitCatalog");
    expect(hook).toContain("unitLabel");
    expect(hook).toMatch(/unitId\.slice\(0, 8\)/);
  });

  it("Phase C2 commit action is wired on draft page", () => {
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("RESERVATION_IMPORT_COMMIT_LABEL");
    expect(page).toContain("evaluateClientCommitEligibility");
    expect(page).not.toContain("RESERVATION_IMPORT_PHASE_C_PLACEHOLDER");
  });

  it("accessible tabs and live region for recheck", () => {
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("<Tabs");
    expect(page).toContain('aria-live="polite"');
    expect(page).toContain("filterRowsForTab(tabId, rows)");
  });

  it("backend GET route exposes conflictBookings enrichment", () => {
    const route = read("app/api/admin/v1/reservation-imports/[batchId]/route.ts");
    expect(route).toContain("conflictBookings");
  });
});
