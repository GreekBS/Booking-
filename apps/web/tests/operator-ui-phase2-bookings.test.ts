import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Talos operator Phase 2 — bookings workspace", () => {
  it("Bookings list uses Phase 1 surfaces, labeled filters, and clear filters", () => {
    const page = read("features/bookings/BookingsPage.tsx");
    expect(page).toContain("New booking");
    expect(page).toContain("Clear filters");
    expect(page).toContain("Arrival from");
    expect(page).toContain("Departure from");
    expect(page).toContain("nightsBetween");
    expect(page).toContain("syncBookingUrl");
    expect(page).toContain("bookingId");
    expect(page).toContain("useActiveProperty");
    expect(page).not.toContain("Manual booking");
  });

  it("reservation Sheet is wide and reuses BookingWorkspaceView", () => {
    const drawer = read("features/bookings/BookingDetailDrawer.tsx");
    expect(drawer).toContain("BookingWorkspaceView");
    expect(drawer).toContain("sm:max-w-[min(900px,92vw)]");
    expect(drawer).not.toContain("sm:max-w-xl");
  });

  it("workspace uses tabs Overview / Financials / Guest / Activity", () => {
    const view = read("features/bookings/workspace/BookingWorkspaceView.tsx");
    expect(view).toContain('value="overview"');
    expect(view).toContain('value="financials"');
    expect(view).toContain('value="guest"');
    expect(view).toContain('value="activity"');
    expect(view).toContain("BookingStaySection");
    expect(view).toContain("BookingPaymentsSection");
    expect(view).toContain("BookingBillingFiscalSection");
    expect(view).toContain("BookingTimelineSection");
  });

  it("guest section does not invent country/language/special requests", () => {
    const guest = read("features/bookings/workspace/sections/BookingGuestSection.tsx");
    expect(guest).toContain("Guest contact");
    expect(guest).toContain("Full name");
    expect(guest).toContain("Email");
    expect(guest).toContain("Phone");
    expect(guest).not.toContain("Country");
    expect(guest).not.toContain("Language");
    expect(guest).not.toContain("Special requests");
  });

  it("quick actions omit fake Message/Print stubs", () => {
    const actions = read("features/bookings/workspace/BookingQuickActions.tsx");
    expect(actions).toContain("Confirm");
    expect(actions).toContain("Cancel reservation");
    expect(actions).not.toContain("Message");
    expect(actions).not.toContain("Print");
  });

  it("pricing vs folio terminology stays distinct", () => {
    const pricing = read("features/bookings/workspace/sections/BookingPricingSection.tsx");
    expect(pricing).toContain("Reservation pricing");
    expect(pricing).toContain("Folio settlement");

    const payments = read("features/bookings/workspace/sections/BookingPaymentsSection.tsx");
    expect(payments).toContain("Folio / Account");
    expect(payments).toContain("Climate Resilience Fee");
    expect(payments).toContain("Fiscal documents");
  });

  it("manual booking defaults to Active Property", () => {
    const manual = read("features/bookings/ManualBookingPage.tsx");
    expect(manual).toContain("useActiveProperty");
    expect(manual).toContain("activePropertyId");
    expect(manual).toContain("Defaults to Active Property");
    expect(manual).toContain("Surface");
  });

  it("calendar host still imports BookingWorkspaceView", () => {
    const cal = read("features/workspace/workspaces/BookingWorkspace.tsx");
    expect(cal).toContain("BookingWorkspaceView");
  });

  it("clears stale booking data when switching reservation id", () => {
    const hook = read("features/bookings/workspace/hooks/useBookingWorkspaceData.ts");
    expect(hook).toContain("Clear previous reservation");
    expect(hook).toContain("setBooking(null)");
  });
});
