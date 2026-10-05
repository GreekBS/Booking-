import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  bookingDrawerHref,
  collectCreatedBookingIds,
} from "@/features/reservation-import/reservation-import-review-utils";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Phase C3 — completed summary + booking links", () => {
  it("bookingDrawerHref uses existing Bookings drawer query param", () => {
    expect(bookingDrawerHref("550e8400-e29b-41d4-a716-446655440099")).toBe(
      "/dashboard/bookings?bookingId=550e8400-e29b-41d4-a716-446655440099",
    );
  });

  it("collectCreatedBookingIds prefers summary ids and ignores empty", () => {
    expect(
      collectCreatedBookingIds({
        summaryIds: ["bk-1", "bk-1", "bk-2"],
        rows: [{ createdBookingId: "bk-ignored" }],
      }),
    ).toEqual(["bk-1", "bk-2"]);
    expect(
      collectCreatedBookingIds({
        summaryIds: [],
        rows: [
          { createdBookingId: "bk-a" },
          { createdBookingId: null },
          { createdBookingId: "bk-a" },
        ],
      }),
    ).toEqual(["bk-a"]);
  });

  it("completed summary shows rejected count from rejectedRows", () => {
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("completedRejected = rejectedRows.length");
    expect(page).toContain("Απορριφθείσες");
    expect(page).toContain("{completedRejected}");
  });

  it("completed summary links created bookings via bookingDrawerHref", () => {
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("bookingDrawerHref(bookingId)");
    expect(page).toContain("RESERVATION_IMPORT_VIEW_BOOKING_LABEL");
    expect(page).toContain("RESERVATION_IMPORT_CREATED_BOOKINGS_TITLE");
    expect(page).toContain("collectCreatedBookingIds");
    expect(page).not.toMatch(/\/dashboard\/bookings\/\$\{/);
  });

  it("row card links only when createdBookingId exists", () => {
    const card = read("features/reservation-import/ReservationImportReviewRowCard.tsx");
    expect(card).toContain("row.createdBookingId");
    expect(card).toContain("bookingDrawerHref(row.createdBookingId)");
    expect(card).toContain("RESERVATION_IMPORT_VIEW_BOOKING_LABEL");
    expect(card).not.toContain("rejectedRows");
  });

  it("completed state remains read-only", () => {
    const page = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(page).toContain("isCompleted");
    expect(page).toContain("{!isCompleted ? (");
    expect(page).toContain("decisionBusy={isCompleted || decisionBusy}");
    expect(page).toContain("RESERVATION_IMPORT_BACK_TO_BOOKINGS");
  });
});

describe("Phase C3 — commit observability", () => {
  it("commit route reuses createLogger without logging CSV/guest PII", () => {
    const route = read(
      "app/api/admin/v1/reservation-imports/[batchId]/commit/route.ts",
    );
    expect(route).toContain('createLogger({ action: "reservation_imports.commit" })');
    expect(route).toContain('logger.info("reservation import commit succeeded"');
    expect(route).toContain('logger.error("reservation import commit failed"');
    expect(route).toContain("alreadyCompleted");
    expect(route).toContain("imported:");
    expect(route).toContain("skipped:");
    expect(route).toContain("replaced:");
    expect(route).toContain("durationMs");
    expect(route).toContain("errorCode");
    expect(route).not.toContain("guestName");
    expect(route).not.toContain("guestEmail");
    expect(route).not.toContain("guestPhone");
    expect(route).not.toContain("payload");
    expect(route).not.toContain("csv");
    expect(route).not.toContain("request.json");
  });

  it("commit semantics still call C1 use case with actor.tenantId", () => {
    const route = read(
      "app/api/admin/v1/reservation-imports/[batchId]/commit/route.ts",
    );
    expect(route).toContain("commitReservationImportBatchUseCase");
    expect(route).toContain("actor.tenantId");
    expect(route).toContain("mapResultError");
  });
});
