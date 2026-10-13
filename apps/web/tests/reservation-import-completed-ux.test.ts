import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReservationImportConflictBookingDto } from "@/lib/admin/reservation-import-api";
import type { ReservationImportRowDto } from "@/lib/admin/reservation-import-api";
import {
  importRowOperatorErrorMessage,
  rowHasNonSupersedeableKeepCsvTarget,
} from "@/features/reservation-import/reservation-import-errors";
import {
  RESERVATION_IMPORT_BULK_SAVING_LABEL,
  RESERVATION_IMPORT_COMMIT_BUSY_LABEL,
  RESERVATION_IMPORT_COMMIT_PROCESSING_DETAIL,
  RESERVATION_IMPORT_COMMIT_PROCESSING_TITLE,
  RESERVATION_IMPORT_COMPLETED_SUCCESS,
  RESERVATION_IMPORT_HISTORICAL_RESOLUTION,
  RESERVATION_IMPORT_ROW_REPLACE_NOT_SUPERSEDEABLE,
} from "@/features/reservation-import/reservation-import-copy";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function row(partial: Partial<ReservationImportRowDto> = {}): ReservationImportRowDto {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? "row-1",
    tenantId: "t1",
    batchId: "b1",
    rowNumber: partial.rowNumber ?? 1,
    sourceNamespace: "csv_reservation_import",
    externalReference: "REF-1",
    unitId: "unit-1",
    checkIn: "2026-11-10",
    checkOut: "2026-11-12",
    temporalClass: "future",
    guestName: "Ada",
    guestEmail: "a@b.co",
    guestPhone: null,
    guestCount: 2,
    priceSource: "imported_csv",
    importedTotalAmount: "120.00",
    importedCurrency: "EUR",
    operatorTotalAmount: null,
    operatorCurrency: null,
    conflictResolution: partial.conflictResolution ?? "keep_csv",
    replaceBookingId: partial.replaceBookingId ?? "bk-old",
    replaceBookingIds: partial.replaceBookingIds ?? ["bk-old"],
    conflictSnapshot: partial.conflictSnapshot ?? {
      version: 1,
      existingBookingIds: ["bk-old"],
      peerImportRowIds: [],
      nonBookingBlockers: [],
      overlaps: [],
    },
    conflictGroupId: null,
    recheckRequired: false,
    status: partial.status ?? "imported",
    createdBookingId: partial.createdBookingId ?? "bk-new",
    supersededBookingId: partial.supersededBookingId ?? "bk-old",
    errorCode: partial.errorCode ?? null,
    errorMessage: partial.errorMessage ?? null,
    payload: {},
    processedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

describe("Completed import UX — stale conflict warnings", () => {
  it("suppresses actionable operator errors on terminal imported rows", () => {
    const imported = row({
      status: "imported",
      errorCode: "REPLACE_TARGET_NOT_SUPERSEDEABLE",
      errorMessage: "not supersedeable: confirmed",
    });
    expect(importRowOperatorErrorMessage(imported)).toBeNull();
  });

  it("still shows actionable replace errors on draft ready rows", () => {
    const draft = row({
      status: "ready",
      createdBookingId: null,
      supersededBookingId: null,
      errorCode: "REPLACE_TARGET_NOT_SUPERSEDEABLE",
      errorMessage: "not supersedeable: pending",
    });
    const msg = importRowOperatorErrorMessage(draft);
    expect(msg).toBeTruthy();
    expect(msg).toContain("αντικατασταθεί");
  });

  it("does not treat already-superseded targets as active blockers", () => {
    const bookings: ReservationImportConflictBookingDto[] = [
      {
        id: "bk-old",
        guestName: "Old",
        checkIn: "2026-11-01",
        checkOut: "2026-11-30",
        status: "confirmed",
        isSuperseded: true,
        hasChannelLink: false,
        hasPayments: false,
        hasFolio: false,
        hasPostedFolioLines: false,
        hasFiscalDocuments: false,
        depsUnavailable: false,
      },
    ];
    expect(rowHasNonSupersedeableKeepCsvTarget(row({ status: "ready" }), bookings)).toBe(
      false,
    );
    expect(
      rowHasNonSupersedeableKeepCsvTarget(row({ status: "imported" }), bookings),
    ).toBe(false);
  });

  it("completed row card shows historical resolution, not actionable NOT_SUPERSEDEABLE", () => {
    const card = read("features/reservation-import/ReservationImportReviewRowCard.tsx");
    expect(card).toContain("batchCompleted");
    expect(card).toContain("RESERVATION_IMPORT_HISTORICAL_RESOLUTION");
    expect(card).toContain("batchCompleted ? null : importRowOperatorErrorMessage");
    expect(card).not.toContain("RESERVATION_IMPORT_ROW_REPLACE_NOT_SUPERSEDEABLE");
    expect(RESERVATION_IMPORT_HISTORICAL_RESOLUTION).toMatch(/[Ιι]στορικ/);
    // Exact contradictory string must only come from active draft conflict panel.
    expect(RESERVATION_IMPORT_ROW_REPLACE_NOT_SUPERSEDEABLE("επιβεβαιωμένη")).toContain(
      "επιβεβαιωμένη",
    );
    const panel = read(
      "features/reservation-import/ReservationImportConflictDecisionPanel.tsx",
    );
    expect(panel).toContain("!b.isSuperseded && !conflictBookingIsSupersedeable(b)");
  });
});

describe("Commit + bulk loading UX contracts", () => {
  it("commit busy label and processing copy are present", () => {
    expect(RESERVATION_IMPORT_COMMIT_BUSY_LABEL).toBe("Εισαγωγή κρατήσεων…");
    expect(RESERVATION_IMPORT_COMMIT_PROCESSING_TITLE).toContain("εξέλιξη");
    expect(RESERVATION_IMPORT_COMMIT_PROCESSING_DETAIL).toContain("ημερολόγιο");
    expect(RESERVATION_IMPORT_COMPLETED_SUCCESS).toContain("επιτυχώς");
    expect(RESERVATION_IMPORT_BULK_SAVING_LABEL).toContain("Αποθήκευση");
  });

  it("confirm dialog blocks dismiss and double-submit while loading", () => {
    const dialog = read("components/admin/confirm-dialog.tsx");
    expect(dialog).toContain("if (!next && loading) return");
    expect(dialog).toContain("if (loading) return");
    expect(dialog).toContain("Loader2");
    expect(dialog).toContain("loadingLabel");
    expect(dialog).toContain("motion-reduce:animate-none");
  });

  it("bulk bar shows spinner and saved-count progress", () => {
    const bulk = read("features/reservation-import/ReservationImportBulkConflictBar.tsx");
    expect(bulk).toContain("RESERVATION_IMPORT_BULK_SAVING_LABEL");
    expect(bulk).toContain('data-testid="import-bulk-saving"');
    expect(bulk).toContain("Loader2");
    expect(bulk).toContain("RESERVATION_IMPORT_BULK_PROGRESS");
  });

  it("hook reconciles completed batch on network uncertainty without re-commit", () => {
    const hook = read("features/reservation-import/useReservationImportReview.ts");
    expect(hook).toContain("getReservationImportDraft(tenantId, batchId)");
    expect(hook).toContain('detail.batch.status === "completed"');
    expect(hook).toContain("alreadyCompleted: true");
    // Only one commitReservationImportDraft call site in the commit path.
    const commits = hook.match(/commitReservationImportDraft\(/g) ?? [];
    expect(commits.length).toBe(1);
  });
});
