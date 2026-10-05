import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AdminApiError, adminFetch } from "@/lib/admin/api";
import {
  updateReservationImportRowDecision,
  type ReservationImportRowDto,
} from "@/lib/admin/reservation-import-api";
import {
  RESERVATION_IMPORT_CONFLICT_PROMPT,
  RESERVATION_IMPORT_KEEP_CSV_CONFIRM_MANY,
  RESERVATION_IMPORT_KEEP_CSV_CONFIRM_ONE,
  RESERVATION_IMPORT_KEEP_CSV_LABEL,
  RESERVATION_IMPORT_KEEP_EXISTING_LABEL,
} from "@/features/reservation-import/reservation-import-copy";
import {
  computeReadinessCounts,
  conflictResolutionLabel,
  relatedConflictRowIds,
  rowAllowsConflictDecision,
  rowHasExistingBookingConflicts,
  rowHasHardBlockers,
  rowHasPeerConflicts,
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
    status: partial.status ?? "pending",
    createdBookingId: null,
    supersededBookingId: null,
    errorCode: partial.errorCode ?? null,
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

describe("B3.3c — conflict decision UI", () => {
  afterEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("single existing booking conflict allows decision controls", () => {
    const r = row({
      conflictSnapshot: {
        version: 1,
        existingBookingIds: ["bk-1"],
        peerImportRowIds: [],
        nonBookingBlockers: [],
        overlaps: [],
      },
    });
    expect(rowHasExistingBookingConflicts(r)).toBe(true);
    expect(rowAllowsConflictDecision(r)).toBe(true);
    const panel = read(
      "features/reservation-import/ReservationImportConflictDecisionPanel.tsx",
    );
    expect(panel).toContain("RESERVATION_IMPORT_CONFLICT_PROMPT");
    expect(panel).toContain("Υπάρχουσες κρατήσεις");
    expect(panel).toContain("Κράτηση CSV");
    expect(RESERVATION_IMPORT_CONFLICT_PROMPT).toContain("σύγκρουση στις ημερομηνίες");
  });

  it("keep_existing PATCH helper sends conflictResolution", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce({ row: row({ conflictResolution: "keep_existing" }) });
    await updateReservationImportRowDecision("t1", "b1", "row-1", {
      conflictResolution: "keep_existing",
    });
    expect(adminFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/rows\/row-1$/),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ conflictResolution: "keep_existing" }),
      }),
    );
  });

  it("authoritative GET refetch after keep_existing is wired in hook", () => {
    const hook = read("features/reservation-import/useReservationImportReview.ts");
    expect(hook).toContain("updateReservationImportRowDecision");
    expect(hook).toContain("decideConflict");
    expect(hook).toMatch(
      /await updateReservationImportRowDecision[\s\S]*await refetch\(\)/,
    );
    expect(hook).not.toContain("setState({ kind: \"ready\", detail: {");
  });

  it("keep_csv confirmation dialog copy for one and many bookings", () => {
    const panel = read(
      "features/reservation-import/ReservationImportConflictDecisionPanel.tsx",
    );
    expect(panel).toContain("ConfirmDialog");
    expect(panel).toContain("RESERVATION_IMPORT_KEEP_CSV_CONFIRM_TITLE");
    expect(panel).toContain("RESERVATION_IMPORT_KEEP_CSV_CONFIRM_ONE");
    expect(panel).toContain("RESERVATION_IMPORT_KEEP_CSV_CONFIRM_MANY");
    expect(RESERVATION_IMPORT_KEEP_CSV_CONFIRM_ONE).toContain("δεν θα αλλάξει ακόμη");
    expect(RESERVATION_IMPORT_KEEP_CSV_CONFIRM_MANY(2)).toContain("2 υπαρχουσών");
  });

  it("keep_csv PATCH helper sends conflictResolution", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce({ row: row({ conflictResolution: "keep_csv" }) });
    await updateReservationImportRowDecision("t1", "b1", "row-1", {
      conflictResolution: "keep_csv",
    });
    expect(adminFetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/rows\/row-1$/),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ conflictResolution: "keep_csv" }),
      }),
    );
  });

  it("hook refetches GET after keep_csv and does not optimistic-mutate", () => {
    const hook = read("features/reservation-import/useReservationImportReview.ts");
    expect(hook).toContain('conflictResolution');
    expect(hook).not.toMatch(/conflictResolution:\s*"keep_csv"/);
    expect(hook).toContain("getReservationImportDraft");
  });

  it("multi-existing booking conflict displays all bookings", () => {
    const panel = read(
      "features/reservation-import/ReservationImportConflictDecisionPanel.tsx",
    );
    expect(panel).toContain("bookings.map");
    expect(panel).toContain("existingBookingIds.map");
    expect(panel).not.toContain("replaceBookingId)");
  });

  it("multi-existing keep_csv surfaces backend replaceBookingIds after GET", () => {
    const panel = read(
      "features/reservation-import/ReservationImportConflictDecisionPanel.tsx",
    );
    expect(panel).toContain("replaceBookingIds");
    expect(panel).toContain("Στόχοι μελλοντικής αντικατάστασης");
    expect(panel).toContain("RESERVATION_IMPORT_KEEP_CSV_NOT_YET_REPLACED");
    const r = row({
      conflictResolution: "keep_csv",
      replaceBookingIds: ["bk-a", "bk-b"],
      conflictSnapshot: {
        version: 1,
        existingBookingIds: ["bk-a", "bk-b"],
        peerImportRowIds: [],
        nonBookingBlockers: [],
        overlaps: [],
      },
    });
    expect(r.replaceBookingIds).toEqual(["bk-a", "bk-b"]);
  });

  it("CSV↔CSV peer conflict display", () => {
    const a = row({
      id: "a",
      conflictSnapshot: {
        version: 1,
        existingBookingIds: [],
        peerImportRowIds: ["b"],
        nonBookingBlockers: [],
        overlaps: [],
      },
    });
    expect(rowHasPeerConflicts(a)).toBe(true);
    expect(rowAllowsConflictDecision(a)).toBe(true);
    const panel = read(
      "features/reservation-import/ReservationImportConflictDecisionPanel.tsx",
    );
    expect(panel).toContain("Επικάλυψη με άλλες γραμμές CSV");
    expect(panel).toContain("peers.map");
  });

  it("selecting CSV B can demote A only after authoritative refetch (no client demotion)", () => {
    const hook = read("features/reservation-import/useReservationImportReview.ts");
    expect(hook).not.toContain("conflictResolution: \"undecided\"");
    expect(hook).not.toContain("demote");
    const panel = read(
      "features/reservation-import/ReservationImportConflictDecisionPanel.tsx",
    );
    expect(panel).not.toMatch(/peer\.conflictResolution\s*=/);
  });

  it("boundary non-overlap does not create conflict controls", () => {
    const r = row({
      status: "ready",
      conflictResolution: "undecided",
      conflictSnapshot: {
        version: 1,
        existingBookingIds: [],
        peerImportRowIds: [],
        nonBookingBlockers: [],
        overlaps: [],
      },
    });
    expect(rowAllowsConflictDecision(r)).toBe(false);
    expect(rowHasExistingBookingConflicts(r)).toBe(false);
    expect(rowHasPeerConflicts(r)).toBe(false);
  });

  it("mixed existing + CSV peer conflict allows decision", () => {
    const r = row({
      conflictSnapshot: {
        version: 1,
        existingBookingIds: ["bk-1"],
        peerImportRowIds: ["peer-1"],
        nonBookingBlockers: [],
        overlaps: [],
      },
    });
    expect(rowHasExistingBookingConflicts(r)).toBe(true);
    expect(rowHasPeerConflicts(r)).toBe(true);
    expect(rowAllowsConflictDecision(r)).toBe(true);
  });

  it("hard blocker has no decision controls", () => {
    const r = row({
      status: "failed",
      conflictSnapshot: {
        version: 1,
        existingBookingIds: [],
        peerImportRowIds: [],
        nonBookingBlockers: [
          {
            blockType: "maintenance",
            checkIn: "2026-12-01",
            checkOut: "2026-12-03",
          },
        ],
        overlaps: [],
      },
    });
    expect(rowHasHardBlockers(r)).toBe(true);
    expect(rowAllowsConflictDecision(r)).toBe(false);
    const panel = read(
      "features/reservation-import/ReservationImportConflictDecisionPanel.tsx",
    );
    expect(panel).toContain("RESERVATION_IMPORT_HARD_BLOCKER_NO_DECISION");
    expect(panel).toContain("allowsDecision ? (");
  });

  it("already-imported row cannot be revived", () => {
    expect(
      rowAllowsConflictDecision(
        row({
          status: "skipped_already_imported",
          conflictSnapshot: {
            version: 1,
            existingBookingIds: ["bk-1"],
            peerImportRowIds: [],
            nonBookingBlockers: [],
            overlaps: [],
          },
        }),
      ),
    ).toBe(false);
    expect(
      rowAllowsConflictDecision(
        row({
          status: "imported",
          conflictSnapshot: {
            version: 1,
            existingBookingIds: ["bk-1"],
            peerImportRowIds: [],
            nonBookingBlockers: [],
            overlaps: [],
          },
        }),
      ),
    ).toBe(false);
    expect(
      rowAllowsConflictDecision(
        row({
          status: "pending",
          errorCode: "ALREADY_IMPORTED",
          conflictSnapshot: {
            version: 1,
            existingBookingIds: [],
            peerImportRowIds: [],
            nonBookingBlockers: [],
            overlaps: [],
          },
        }),
      ),
    ).toBe(false);
  });

  it("mutation loading prevents duplicate PATCH", () => {
    const panel = read(
      "features/reservation-import/ReservationImportConflictDecisionPanel.tsx",
    );
    expect(panel).toContain("controlsDisabled");
    expect(panel).toContain("disabled={controlsDisabled}");
    const hook = read("features/reservation-import/useReservationImportReview.ts");
    expect(hook).toContain("decidingRowId");
    expect(hook).toContain("decisionBusy");
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("decisionBusy");
  });

  it("PATCH failure preserves previous authoritative state", () => {
    const hook = read("features/reservation-import/useReservationImportReview.ts");
    expect(hook).toMatch(/catch \{[\s\S]*setDecidingRowId\(null\);[\s\S]*phase: "patch"/);
    expect(hook).not.toMatch(/setState\(\{ kind: "ready".*keep_csv/);
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("RESERVATION_IMPORT_DECISION_ERROR");
  });

  it("GET-refetch failure does not show optimistic success", () => {
    const hook = read("features/reservation-import/useReservationImportReview.ts");
    expect(hook).toContain('phase: "refetch"');
    expect(hook).toContain("setRefetchFailed(true)");
    expect(hook).toContain("refetchFailed");
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("RESERVATION_IMPORT_REFETCH_AFTER_DECISION_ERROR");
    expect(page).toContain("refetchFailed");
  });

  it("recheck invalidates stale decision via authoritative GET", () => {
    const hook = read("features/reservation-import/useReservationImportReview.ts");
    expect(hook).toMatch(/await recheckReservationImportDraft[\s\S]*return await refetch\(\)/);
  });

  it("readiness counts update from refetched DTO", () => {
    const before = [
      row({ id: "1", status: "pending" }),
      row({ id: "2", status: "ready" }),
    ];
    expect(computeReadinessCounts(before, []).needAction).toBe(1);
    const afterKeepExisting = [
      row({ id: "1", status: "skipped", conflictResolution: "keep_existing" }),
      row({ id: "2", status: "ready" }),
    ];
    expect(computeReadinessCounts(afterKeepExisting, [])).toMatchObject({
      skipped: 1,
      ready: 1,
      needAction: 0,
    });
  });

  it("historical row remains allowed for conflict decision", () => {
    const r = row({
      temporalClass: "historical",
      conflictSnapshot: {
        version: 1,
        existingBookingIds: ["bk-1"],
        peerImportRowIds: [],
        nonBookingBlockers: [],
        overlaps: [],
      },
    });
    expect(rowAllowsConflictDecision(r)).toBe(true);
    const card = read("features/reservation-import/ReservationImportReviewRowCard.tsx");
    expect(card).toContain("Ιστορική κράτηση");
  });

  it("unresolved price remains unresolved after conflict decision (pricing separate)", () => {
    const r = row({
      priceSource: "unresolved",
      conflictResolution: "keep_csv",
      status: "pending",
      conflictSnapshot: {
        version: 1,
        existingBookingIds: ["bk-1"],
        peerImportRowIds: [],
        nonBookingBlockers: [],
        overlaps: [],
      },
    });
    expect(r.priceSource).toBe("unresolved");
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).not.toContain("talos_for_all_missing");
    expect(page).not.toContain("updateReservationImportMissingPriceStrategy");
    const panel = read(
      "features/reservation-import/ReservationImportConflictDecisionPanel.tsx",
    );
    expect(panel).not.toContain("priceSource");
  });

  it("Phase C2 commit is separate from conflict decision row cards", () => {
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("RESERVATION_IMPORT_COMMIT_LABEL");
    expect(page).toContain("evaluateClientCommitEligibility");
    expect(page).not.toContain("Booking.create");
    expect(page).not.toContain("RESERVATION_IMPORT_PHASE_C_PLACEHOLDER");
    const card = read("features/reservation-import/ReservationImportReviewRowCard.tsx");
    expect(card).not.toContain("/commit");
  });

  it("current decision labels render from GET conflictResolution", () => {
    expect(conflictResolutionLabel("undecided")).toBe("Δεν έχει επιλεγεί");
    expect(conflictResolutionLabel("keep_existing")).toBe(
      RESERVATION_IMPORT_KEEP_EXISTING_LABEL,
    );
    expect(conflictResolutionLabel("keep_csv")).toBe(RESERVATION_IMPORT_KEEP_CSV_LABEL);
    const panel = read(
      "features/reservation-import/ReservationImportConflictDecisionPanel.tsx",
    );
    expect(panel).toContain("conflictResolutionLabel(resolution)");
    expect(panel).toContain("aria-pressed");
  });

  it("related peer ids used for conflict locking helpers", () => {
    const a = row({
      id: "a",
      conflictSnapshot: {
        version: 1,
        existingBookingIds: [],
        peerImportRowIds: ["b"],
        nonBookingBlockers: [],
        overlaps: [],
      },
    });
    const b = row({
      id: "b",
      conflictSnapshot: {
        version: 1,
        existingBookingIds: [],
        peerImportRowIds: ["a"],
        nonBookingBlockers: [],
        overlaps: [],
      },
    });
    expect(relatedConflictRowIds(a, [a, b]).sort()).toEqual(["a", "b"]);
  });

  it("PATCH failure path distinguishes AdminApiError without mutating local resolution", async () => {
    vi.mocked(adminFetch).mockRejectedValueOnce(
      new AdminApiError("VALIDATION_ERROR", "CSV import exclusivity violated", 400),
    );
    await expect(
      updateReservationImportRowDecision("t1", "b1", "row-1", {
        conflictResolution: "keep_csv",
      }),
    ).rejects.toBeInstanceOf(AdminApiError);
  });
});
