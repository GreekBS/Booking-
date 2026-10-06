import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("B3.1 — CSV reservation import entry + draft shells", () => {
  it("Bookings create CTA is a DropdownMenu with both actions", () => {
    const menu = read("features/reservation-import/BookingCreateMenu.tsx");
    expect(menu).toContain("DropdownMenu");
    expect(menu).toContain("Νέα κράτηση");
    expect(menu).toContain('href="/dashboard/bookings/new"');
    expect(menu).toContain("Εισαγωγή από CSV");
    expect(menu).toContain('href="/dashboard/bookings/import"');
    expect(menu).toContain('aria-label="Επιλογές νέας κράτησης"');

    const page = read("features/bookings/BookingsPage.tsx");
    expect(page).toContain("BookingCreateMenu");
    expect(page).toContain("ReservationImportDraftList");
    expect(page).not.toContain('href="/dashboard/bookings/new"');
    expect(page).not.toMatch(/<Link href="\/dashboard\/bookings\/new"/);
  });

  it("empty-state reuses BookingCreateMenu via EmptyState actions", () => {
    const empty = read("components/admin/empty-state.tsx");
    expect(empty).toContain("actions?:");
    const page = read("features/bookings/BookingsPage.tsx");
    expect(page).toContain("actions={<BookingCreateMenu align=\"center\" />}");
  });

  it("manual booking route and page remain unchanged entry targets", () => {
    const route = read("app/(dashboard)/dashboard/bookings/new/page.tsx");
    expect(route).toContain("ManualBookingPage");
    const manual = read("features/bookings/ManualBookingPage.tsx");
    expect(manual).toContain('title="Νέα κράτηση"');
    expect(manual).toContain("createManualBooking");
    expect(manual).not.toContain("reservation-import");
  });

  it("adds import landing and draft resume routes", () => {
    const landingRoute = read("app/(dashboard)/dashboard/bookings/import/page.tsx");
    expect(landingRoute).toContain("ReservationImportLandingPage");
    const draftRoute = read(
      "app/(dashboard)/dashboard/bookings/import/[batchId]/page.tsx",
    );
    expect(draftRoute).toContain("ReservationImportDraftPage");

    const landing = read("features/reservation-import/ReservationImportLandingPage.tsx");
    expect(landing).toContain("Εισαγωγή κρατήσεων από CSV");
    // B3.2 replaced the B3.1 “coming soon” shell with the upload workflow.
    expect(landing).toContain("ReservationImportUpload");
    expect(landing).toContain("RESERVATION_IMPORT_CONTINUE_TO_REVIEW_LABEL");

    const draft = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(draft).toContain("RESERVATION_IMPORT_DRAFT_TTL_MESSAGE");
    expect(draft).toContain("expiresAt");
    expect(draft).toContain("useReservationImportReview");
    expect(draft).toContain("conflictBookings");
    expect(draft).toContain("RESERVATION_IMPORT_EXPIRED_MESSAGE");
    expect(draft).toContain('router.push("/dashboard/bookings")');
    expect(draft).not.toContain("localStorage");
    expect(draft).not.toContain("sessionStorage");
    expect(draft).toContain("decideConflict");
    expect(draft).toContain("RESERVATION_IMPORT_COMMIT_LABEL");
    expect(draft).toContain("evaluateClientCommitEligibility");
  });

  it("draft list uses list API fields only and ConfirmDialog discard", () => {
    const list = read("features/reservation-import/ReservationImportDraftList.tsx");
    expect(list).toContain("listReservationImportDrafts");
    expect(list).toContain("discardReservationImportDraft");
    expect(list).toContain("ConfirmDialog");
    expect(list).toContain("RESERVATION_IMPORT_DISCARD_DESCRIPTION");
    expect(list).toContain("RESERVATION_IMPORT_DRAFT_TTL_MESSAGE");
    expect(list).toContain("filename");
    expect(list).toContain("expiresAt");
    expect(list).toContain("rowCount");
    expect(list).toContain("Συνέχεια");
    expect(list).toContain("Απόρριψη");
    expect(list).not.toContain("conflictCount");
    expect(list).not.toContain("unresolved");
  });

  it("API client covers list/get/discard and B3.3b mutation helpers", () => {
    const api = read("lib/admin/reservation-import-api.ts");
    expect(api).toContain("listReservationImportDrafts");
    expect(api).toContain("getReservationImportDraft");
    expect(api).toContain("discardReservationImportDraft");
    expect(api).toContain("/reservation-imports");
    expect(api).toContain("/discard");
    expect(api).toContain("recheckReservationImportDraft");
    expect(api).toContain("/recheck");
    expect(api).toContain("updateReservationImportRowDecision");
    expect(api).toContain("updateReservationImportMissingPriceStrategy");
    expect(api).toContain("conflictBookings");
  });

  it("does not invent client-side createdAt+72h expiry authority", () => {
    const list = read("features/reservation-import/ReservationImportDraftList.tsx");
    const draft = read("features/reservation-import/ReservationImportDraftPage.tsx");
    expect(list).not.toContain("72 * 60");
    expect(draft).not.toContain("72 * 60");
    expect(list).not.toContain("RESERVATION_IMPORT_DRAFT_TTL_MS");
    expect(draft).not.toContain("RESERVATION_IMPORT_DRAFT_TTL_MS");
  });
});
