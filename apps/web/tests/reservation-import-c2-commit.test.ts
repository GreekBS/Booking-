import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AdminApiError, adminFetch } from "@/lib/admin/api";
import {
  commitReservationImportDraft,
  isReservationImportCommitNotReadyError,
  isReservationImportStaleCommitError,
  type ReservationImportBatchDto,
  type ReservationImportDraftDetail,
  type ReservationImportRowDto,
} from "@/lib/admin/reservation-import-api";
import {
  computeCommitPreviewCounts,
  evaluateClientCommitEligibility,
} from "@/features/reservation-import/reservation-import-commit-eligibility";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function batch(partial: Partial<ReservationImportBatchDto> = {}): ReservationImportBatchDto {
  const now = Date.now();
  return {
    id: "b1",
    tenantId: "t1",
    actorId: "a1",
    sourceNamespace: "csv_reservation_import",
    filename: "import.csv",
    byteSize: 100,
    rowCount: 1,
    status: "draft",
    missingPriceStrategy: "undecided",
    expiresAt: new Date(now + 72 * 3600_000).toISOString(),
    committedAt: null,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    ...partial,
  };
}

function row(partial: Partial<ReservationImportRowDto> = {}): ReservationImportRowDto {
  const now = new Date().toISOString();
  return {
    id: partial.id ?? "row-1",
    tenantId: "t1",
    batchId: "b1",
    rowNumber: partial.rowNumber ?? 1,
    sourceNamespace: "csv_reservation_import",
    externalReference: partial.externalReference ?? "REF-1",
    unitId: "550e8400-e29b-41d4-a716-446655440001",
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
    conflictResolution: "undecided",
    replaceBookingId: null,
    replaceBookingIds: [],
    conflictSnapshot: {
      version: 1,
      existingBookingIds: [],
      peerImportRowIds: [],
      nonBookingBlockers: [],
      overlaps: [],
    },
    conflictGroupId: null,
    recheckRequired: false,
    status: "ready",
    createdBookingId: null,
    supersededBookingId: null,
    errorCode: null,
    errorMessage: null,
    payload: {},
    processedAt: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function detail(
  partial: Partial<ReservationImportDraftDetail> & {
    batch?: Partial<ReservationImportBatchDto>;
    rows?: ReservationImportRowDto[];
  } = {},
): ReservationImportDraftDetail {
  return {
    batch: batch(partial.batch),
    rows: partial.rows ?? [row()],
    rejectedRows: partial.rejectedRows ?? [],
    conflictBookings: partial.conflictBookings ?? [],
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

describe("Phase C2 — commit API client", () => {
  afterEach(() => {
    vi.mocked(adminFetch).mockReset();
  });

  it("calls POST /reservation-imports/:batchId/commit without decision body fields", async () => {
    vi.mocked(adminFetch).mockResolvedValueOnce({
      alreadyCompleted: false,
      batch: batch({ status: "completed" }),
      rows: [row({ status: "imported", createdBookingId: "bk-1" })],
      summary: {
        imported: 1,
        skipped: 0,
        createdBookingIds: ["bk-1"],
        supersededBookingIds: [],
        skippedRowIds: [],
      },
    });
    await commitReservationImportDraft("t1", "b1");
    expect(adminFetch).toHaveBeenCalledWith(
      "/reservation-imports/b1/commit",
      expect.objectContaining({
        method: "POST",
        tenantId: "t1",
        body: "{}",
      }),
    );
    const body = vi.mocked(adminFetch).mock.calls[0]![1]!.body as string;
    expect(body).not.toContain("conflictResolution");
    expect(body).not.toContain("priceSource");
    expect(body).not.toContain("tenantId");
  });

  it("detects stale 409 vs not-ready 400 commit errors", () => {
    expect(
      isReservationImportStaleCommitError(
        new AdminApiError("CONFLICT", "replaceBookingIds are stale", 409),
      ),
    ).toBe(true);
    expect(
      isReservationImportCommitNotReadyError(
        new AdminApiError("VALIDATION_ERROR", "Import commit blocked: pending", 400),
      ),
    ).toBe(true);
    expect(
      isReservationImportStaleCommitError(
        new AdminApiError("VALIDATION_ERROR", "pending", 400),
      ),
    ).toBe(false);
  });
});

describe("Phase C2 — commit route contract", () => {
  it("mirrors discard/recheck auth and calls C1 use case with actor.tenantId", () => {
    const route = read(
      "app/api/admin/v1/reservation-imports/[batchId]/commit/route.ts",
    );
    expect(route).toContain("requireTenantContext");
    expect(route).toContain("toPermissionActor");
    expect(route).toContain("commitReservationImportBatchUseCase");
    expect(route).toContain("actor.tenantId");
    expect(route).toContain("mapResultError");
    expect(route).toContain("alreadyCompleted");
    expect(route).toContain("serializeReservationImportBatch");
    expect(route).toContain("serializeReservationImportRow");
    expect(route).not.toContain("request.json");
    expect(route).not.toContain("request.body");
    expect(route).not.toMatch(/tenantIdFromBody|body\.tenantId/);
  });

  it("does not add route-level locks or messaging side effects", () => {
    const route = read(
      "app/api/admin/v1/reservation-imports/[batchId]/commit/route.ts",
    );
    expect(route).not.toContain("FOR UPDATE");
    expect(route).not.toContain("messagingActivation");
    expect(route).not.toContain("whatsapp");
    expect(route).not.toContain("payment");
  });
});

describe("Phase C2 — client eligibility reuses C1 domain helper", () => {
  it("eligible ready draft with frozen price", () => {
    const gate = evaluateClientCommitEligibility(detail());
    expect(gate.kind).toBe("eligible");
    if (gate.kind === "eligible") {
      expect(gate.counts.importCount).toBe(1);
      expect(gate.counts.skipCount).toBe(0);
      expect(gate.counts.replacementBookingCount).toBe(0);
    }
  });

  it("blocks unresolved price", () => {
    const gate = evaluateClientCommitEligibility(
      detail({
        rows: [row({ priceSource: "unresolved", importedTotalAmount: null, status: "pending" })],
      }),
    );
    expect(gate.kind).toBe("blocked");
    if (gate.kind === "blocked") {
      expect(["unresolved_price", "not_ready"]).toContain(gate.reasonKey);
    }
  });

  it("blocks unresolved conflict / recheckRequired", () => {
    const conflict = evaluateClientCommitEligibility(
      detail({
        rows: [
          row({
            status: "pending",
            conflictSnapshot: {
              version: 1,
              existingBookingIds: ["bk-old"],
              peerImportRowIds: [],
              nonBookingBlockers: [],
              overlaps: [],
            },
            conflictResolution: "undecided",
          }),
        ],
      }),
    );
    expect(conflict.kind).toBe("blocked");

    const recheck = evaluateClientCommitEligibility(
      detail({ rows: [row({ recheckRequired: true })] }),
    );
    expect(recheck.kind).toBe("blocked");
    if (recheck.kind === "blocked") {
      expect(recheck.reasonKey).toBe("recheck_required");
    }
  });

  it("blocks keep_csv peer exclusivity overlap", () => {
    const gate = evaluateClientCommitEligibility(
      detail({
        rows: [
          row({
            id: "r1",
            rowNumber: 1,
            externalReference: "A",
            checkIn: "2026-11-10",
            checkOut: "2026-11-14",
            conflictResolution: "keep_csv",
            replaceBookingIds: ["bk-a"],
          }),
          row({
            id: "r2",
            rowNumber: 2,
            externalReference: "B",
            checkIn: "2026-11-12",
            checkOut: "2026-11-16",
            conflictResolution: "keep_csv",
            replaceBookingIds: ["bk-b"],
          }),
        ],
      }),
    );
    expect(gate.kind).toBe("blocked");
    if (gate.kind === "blocked") {
      expect(gate.reasonKey).toBe("exclusivity");
    }
  });

  it("counts keep_csv replacements and keep_existing skips", () => {
    const rows = [
      row({
        id: "r1",
        status: "ready",
        conflictResolution: "keep_csv",
        replaceBookingIds: ["bk-1", "bk-2"],
      }),
      row({
        id: "r2",
        status: "skipped",
        conflictResolution: "keep_existing",
        errorCode: "KEEP_EXISTING",
        externalReference: "REF-2",
      }),
    ];
    const counts = computeCommitPreviewCounts(rows, [{ id: "rej" } as never]);
    expect(counts.importCount).toBe(1);
    expect(counts.skipCount).toBe(1);
    expect(counts.replacementBookingCount).toBe(2);
    expect(counts.rejectedCount).toBe(1);

    const gate = evaluateClientCommitEligibility(detail({ rows, rejectedRows: [] }));
    expect(gate.kind).toBe("eligible");
    if (gate.kind === "eligible") {
      expect(gate.counts.replacementBookingCount).toBe(2);
      expect(gate.counts.skipCount).toBe(1);
    }
  });

  it("fail-closed on refetchFailed / mutationBusy / completed", () => {
    expect(
      evaluateClientCommitEligibility(detail(), { refetchFailed: true }).kind,
    ).toBe("blocked");
    expect(
      evaluateClientCommitEligibility(detail(), { mutationBusy: true }).kind,
    ).toBe("blocked");
    expect(
      evaluateClientCommitEligibility(
        detail({ batch: { status: "completed", committedAt: new Date().toISOString() } }),
      ).kind,
    ).toBe("completed");
  });

  it("blocks expired draft via domain eligibility", () => {
    const gate = evaluateClientCommitEligibility(
      detail({
        batch: {
          status: "draft",
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        },
      }),
    );
    expect(gate.kind).toBe("blocked");
    if (gate.kind === "blocked") {
      expect(gate.reasonKey).toBe("expired");
    }
  });
});

describe("Phase C2 — UI commit workflow wiring", () => {
  it("draft page exposes commit action, confirmation, and completed read-only state", () => {
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("RESERVATION_IMPORT_COMMIT_LABEL");
    expect(page).toContain("RESERVATION_IMPORT_COMMIT_CONFIRM_TITLE");
    expect(page).toContain("evaluateClientCommitEligibility");
    expect(page).toContain("canCommit");
    expect(page).toContain("isCompleted");
    expect(page).toContain("RESERVATION_IMPORT_COMPLETED_TITLE");
    expect(page).toContain("RESERVATION_IMPORT_BACK_TO_BOOKINGS");
    expect(page).toContain("RESERVATION_IMPORT_COMMIT_STALE_ERROR");
    expect(page).toContain('href="/dashboard/bookings"');
    expect(page).not.toContain("RESERVATION_IMPORT_PHASE_C_PLACEHOLDER");
    expect(page).not.toContain("messagingActivation");
    const copy = read("features/reservation-import/reservation-import-copy.ts");
    expect(copy).toContain('RESERVATION_IMPORT_COMMIT_LABEL = "Ολοκλήρωση εισαγωγής"');
  });

  it("hook commits then refetches; handles stale with recheck", () => {
    const hook = read("features/reservation-import/useReservationImportReview.ts");
    expect(hook).toContain("commitReservationImportDraft");
    expect(hook).toContain("committing");
    expect(hook).toContain("isReservationImportStaleCommitError");
    expect(hook).toContain("recheckReservationImportDraft");
    expect(hook).toContain('phase: "stale"');
    expect(hook).toContain('phase: "not_ready"');
    expect(hook).toContain("setCommitting(true)");
  });

  it("eligibility adapter imports domain evaluateReservationImportCommitEligibility", () => {
    const util = read(
      "features/reservation-import/reservation-import-commit-eligibility.ts",
    );
    expect(util).toContain("evaluateReservationImportCommitEligibility");
    expect(util).toContain("mapBatch");
    expect(util).toContain("mapRow");
  });

  it("copy includes commit confirmation and supersede wording", () => {
    const copy = read("features/reservation-import/reservation-import-copy.ts");
    expect(copy).toContain("RESERVATION_IMPORT_COMMIT_CONFIRM_BODY");
    expect(copy).toContain("supersede");
    expect(copy).toContain("δεν διαγράφονται οριστικά");
  });
});
