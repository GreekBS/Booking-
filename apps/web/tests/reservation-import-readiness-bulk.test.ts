import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AdminApiError } from "@/lib/admin/api";
import type {
  ReservationImportConflictBookingDto,
  ReservationImportRowDto,
} from "@/lib/admin/reservation-import-api";
import {
  countNonSupersedeableConflictRows,
  importRowOperatorErrorMessage,
  mapCommitFailureToOperatorMessage,
  rowHasNonSupersedeableKeepCsvTarget,
} from "@/features/reservation-import/reservation-import-errors";
import {
  RESERVATION_IMPORT_COMMIT_REPLACE_NOT_SUPERSEDEABLE,
  RESERVATION_IMPORT_ROW_REPLACE_NOT_SUPERSEDEABLE,
} from "@/features/reservation-import/reservation-import-copy";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function row(partial: Partial<ReservationImportRowDto> = {}): ReservationImportRowDto {
  return {
    id: partial.id ?? "r1",
    tenantId: "t1",
    batchId: "b1",
    rowNumber: partial.rowNumber ?? 1,
    sourceNamespace: "csv_reservation_import",
    externalReference: "EXT-1",
    unitId: "u1",
    checkIn: "2026-12-01",
    checkOut: "2026-12-05",
    temporalClass: "future",
    guestName: "Guest",
    guestEmail: null,
    guestPhone: null,
    guestCount: 2,
    priceSource: "imported_csv",
    importedTotalAmount: "100",
    importedCurrency: "EUR",
    operatorTotalAmount: null,
    operatorCurrency: null,
    conflictResolution: partial.conflictResolution ?? "undecided",
    replaceBookingId: null,
    replaceBookingIds: partial.replaceBookingIds ?? [],
    conflictSnapshot: partial.conflictSnapshot ?? {
      version: 1,
      existingBookingIds: ["bk1"],
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
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
}

describe("reservation-import readiness + bulk (Phase A/B)", () => {
  it("maps REPLACE_TARGET_NOT_SUPERSEDEABLE to Greek without English dumps", () => {
    const message = importRowOperatorErrorMessage(
      row({
        errorCode: "REPLACE_TARGET_NOT_SUPERSEDEABLE",
        errorMessage: "REPLACE_TARGET_NOT_SUPERSEDEABLE:confirmed",
      }),
    );
    expect(message).toBe(
      RESERVATION_IMPORT_ROW_REPLACE_NOT_SUPERSEDEABLE("επιβεβαιωμένη"),
    );
    expect(message).not.toMatch(/Import commit blocked/i);
  });

  it("detects confirmed conflict bookings as non-supersedeable", () => {
    const bookings: ReservationImportConflictBookingDto[] = [
      {
        id: "bk1",
        guestName: "A",
        checkIn: "2026-12-01",
        checkOut: "2026-12-05",
        status: "confirmed",
        isSuperseded: false,
      },
    ];
    expect(rowHasNonSupersedeableKeepCsvTarget(row(), bookings)).toBe(true);
    expect(
      countNonSupersedeableConflictRows(
        [row(), row({ id: "r2", rowNumber: 2, conflictResolution: "keep_csv" })],
        bookings,
      ),
    ).toBe(2);

    const completed: ReservationImportConflictBookingDto[] = [
      { ...bookings[0]!, status: "completed" },
    ];
    expect(rowHasNonSupersedeableKeepCsvTarget(row(), completed)).toBe(false);
  });

  it("classifies commit ConflictError supersedeability as replace_blocked toast path", () => {
    const mapped = mapCommitFailureToOperatorMessage(
      new AdminApiError(
        "CONFLICT",
        "Import commit blocked: row 1 replace target x is not supersedeable (status: confirmed)",
        409,
        { conflictType: "REPLACE_TARGET_NOT_SUPERSEDEABLE" },
      ),
    );
    expect(mapped.kind).toBe("replace_blocked");
    expect(mapped.message).toBe(RESERVATION_IMPORT_COMMIT_REPLACE_NOT_SUPERSEDEABLE);
  });

  it("wires bulk bar + shared evaluateKeepCsvReplaceTargets into draft/create paths", () => {
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("ReservationImportBulkConflictBar");
    expect(page).toContain("RESERVATION_IMPORT_RECHECK_RESET_HINT");
    expect(page).toContain("replace_blocked");
    expect(page).toContain("RESERVATION_IMPORT_BULK_PARTIAL");
    expect(page).toContain("handleBulkKeepCsvConfirm");
    expect(page).toContain("rowAllowsBulkKeepCsv");

    const bulk = read("features/reservation-import/ReservationImportBulkConflictBar.tsx");
    expect(bulk).toContain('data-testid="import-bulk-keep-csv"');
    expect(bulk).toContain('data-testid="import-bulk-select-all"');
    expect(bulk).toContain('data-testid="import-bulk-keep-existing"');
    expect(bulk).toContain("RESERVATION_IMPORT_BULK_SELECTED");

    const create = readFileSync(
      join(root, "../../packages/domain/src/commerce/import/CreateReservationImportDraftUseCase.ts"),
      "utf8",
    );
    expect(create).toContain("evaluateKeepCsvReplaceTargets");
    expect(create).toContain("replaceTargetIssue");
    expect(create).toContain("requireLiveSetEquality: false");

    const reval = readFileSync(
      join(root, "../../packages/domain/src/commerce/import/ReservationImportCommitRevalidation.ts"),
      "utf8",
    );
    expect(reval).toContain("evaluateKeepCsvReplaceTargets");
    expect(reval).toContain("REPLACE_TARGET_NOT_SUPERSEDEABLE");
    expect(reval).toContain("issue.code");
  });

  it("counts four confirmed targets as non-supersedeable and four completed as eligible", () => {
    const confirmedIds = ["c1", "c2", "c3", "c4"];
    const completedIds = ["d1", "d2", "d3", "d4"];
    const confirmedBookings: ReservationImportConflictBookingDto[] = confirmedIds.map(
      (id) => ({
        id,
        guestName: "G",
        checkIn: "2026-12-01",
        checkOut: "2026-12-05",
        status: "confirmed",
        isSuperseded: false,
      }),
    );
    const completedBookings: ReservationImportConflictBookingDto[] = completedIds.map(
      (id) => ({
        id,
        guestName: "G",
        checkIn: "2026-12-01",
        checkOut: "2026-12-05",
        status: "completed",
        isSuperseded: false,
      }),
    );
    const confirmedRows = confirmedIds.map((id, i) =>
      row({
        id: `r-${id}`,
        rowNumber: i + 1,
        conflictResolution: "undecided",
        conflictSnapshot: {
          version: 1,
          existingBookingIds: [id],
          peerImportRowIds: [],
          nonBookingBlockers: [],
          overlaps: [],
        },
      }),
    );
    const completedRows = completedIds.map((id, i) =>
      row({
        id: `r-${id}`,
        rowNumber: i + 10,
        conflictResolution: "keep_csv",
        conflictSnapshot: {
          version: 1,
          existingBookingIds: [id],
          peerImportRowIds: [],
          nonBookingBlockers: [],
          overlaps: [],
        },
      }),
    );
    expect(countNonSupersedeableConflictRows(confirmedRows, confirmedBookings)).toBe(4);
    expect(countNonSupersedeableConflictRows(completedRows, completedBookings)).toBe(0);
  });

  it("treats mixed booking statuses as blocked when any target is not completed", () => {
    const bookings: ReservationImportConflictBookingDto[] = [
      {
        id: "bk-ok",
        guestName: "A",
        checkIn: "2026-12-01",
        checkOut: "2026-12-05",
        status: "completed",
        isSuperseded: false,
      },
      {
        id: "bk-bad",
        guestName: "B",
        checkIn: "2026-12-02",
        checkOut: "2026-12-06",
        status: "confirmed",
        isSuperseded: false,
      },
    ];
    const mixed = row({
      conflictResolution: "keep_csv",
      conflictSnapshot: {
        version: 1,
        existingBookingIds: ["bk-ok", "bk-bad"],
        peerImportRowIds: [],
        nonBookingBlockers: [],
        overlaps: [],
      },
    });
    expect(rowHasNonSupersedeableKeepCsvTarget(mixed, bookings)).toBe(true);
  });
});
