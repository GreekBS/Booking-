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
    expect(page).toContain("BookingCreateMenu");
    expect(page).toContain("elCommon.clearFilters");
    expect(page).toContain("elCommon.checkIn");
    expect(page).toContain("elCommon.checkOut");
    expect(page).toContain("nightsBetween");
    expect(page).toContain("syncBookingUrl");
    expect(page).toContain("bookingId");
    expect(page).toContain("useActiveProperty");
    expect(page).not.toContain("Manual booking");
  });

  it("reservation Sheet is wide and reuses BookingWorkspaceView", () => {
    const drawer = read("features/bookings/BookingDetailDrawer.tsx");
    expect(drawer).toContain("BookingWorkspaceView");
    expect(drawer).toContain("sm:max-w-[min(920px,94vw)]");
    expect(drawer).toContain("font-sans");
    expect(drawer).not.toContain("sm:max-w-xl");
  });

  it("workspace uses tabs Overview / Financials / Guest / Activity", () => {
    const view = read("features/bookings/workspace/BookingWorkspaceView.tsx");
    expect(view).toContain('value="overview"');
    expect(view).toContain('value="financials"');
    expect(view).toContain('value="guest"');
    expect(view).toContain('value="activity"');
    expect(view).toContain("Επισκόπηση");
    expect(view).toContain("Οικονομικά");
    expect(view).toContain("BookingStaySection");
    expect(view).toContain("BookingPaymentsSection");
    expect(view).toContain("BookingBillingFiscalSection");
    expect(view).toContain("BookingTimelineSection");
    expect(view).toContain("BookingFinancialRepricePanel");
    expect(view).toContain("BookingCommercialAmendmentsSection");
    expect(view).toContain("font-sans");
    expect(view).toContain("compact");
    expect(view).toContain("data-[state=active]:text-primary");
    // Overview skips read-only stay duplicate (header summary owns dates)
    expect(view).toContain("!stayReadOnly");
    // Financials tab body: Pricing → Payments → Reprice → Amendments
    const finBody = view.indexOf("forceMount");
    expect(finBody).toBeGreaterThan(-1);
    const pricingIdx = view.indexOf("<BookingPricingSection", finBody);
    const paymentsIdx = view.indexOf("<BookingPaymentsSection", finBody);
    const repriceIdx = view.indexOf("<BookingFinancialRepricePanel", finBody);
    const amendIdx = view.indexOf("<BookingCommercialAmendmentsSection", finBody);
    expect(pricingIdx).toBeGreaterThan(finBody);
    expect(paymentsIdx).toBeGreaterThan(pricingIdx);
    expect(repriceIdx).toBeGreaterThan(paymentsIdx);
    expect(amendIdx).toBeGreaterThan(repriceIdx);
  });

  it("drawer header hierarchy locks sans scale and demotes technical IDs", () => {
    const header = read("features/bookings/workspace/BookingWorkspaceHeader.tsx");
    expect(header).toContain("font-sans");
    expect(header).toContain("text-[23px]");
    expect(header).toContain("Τεχνικά στοιχεία");
    expect(header).toContain("formatBookingDisplayId");
    expect(header).toContain("<details");
    expect(header).toContain("SummaryCell");
    expect(header).not.toContain("text-[10px] font-semibold uppercase");

    const section = read("features/workspace/components/WorkspaceSection.tsx");
    expect(section).toContain("rounded-[11px] border border-border bg-surface");
    expect(section).toContain("text-[15px] font-semibold");
    expect(section).not.toContain("uppercase tracking-wide");

    const actions = read("features/bookings/workspace/BookingQuickActions.tsx");
    expect(actions).toContain('variant="outline"');
    expect(actions).toContain("text-destructive");
    expect(actions).not.toContain('variant="destructive"');

    const root = read("app/layout.tsx");
    expect(root).toContain("Inter");
    expect(root).toContain("--font-talos-sans");
  });

  it("guest section does not invent country/language/special requests", () => {
    const guest = read("features/bookings/workspace/sections/BookingGuestSection.tsx");
    expect(guest).toContain("Επικοινωνία επισκέπτη");
    expect(guest).toContain("Πλήρες όνομα");
    expect(guest).toContain("elCommon.email");
    expect(guest).toContain("elCommon.phone");
    expect(guest).not.toContain("Country");
    expect(guest).not.toContain("Language");
    expect(guest).not.toContain("Special requests");
  });

  it("quick actions omit fake Message/Print stubs", () => {
    const actions = read("features/bookings/workspace/BookingQuickActions.tsx");
    expect(actions).toContain("elCommon.confirm");
    expect(actions).toContain("Ακύρωση κράτησης");
    expect(actions).not.toContain("Message");
    expect(actions).not.toContain("Print");
  });

  it("pricing vs folio terminology stays distinct", () => {
    const pricing = read("features/bookings/workspace/sections/BookingPricingSection.tsx");
    expect(pricing).toContain("Τιμολόγηση κράτησης");

    const payments = read("features/bookings/workspace/sections/BookingPaymentsSection.tsx");
    expect(payments).toContain("Λογαριασμός κράτησης");
    expect(payments).toContain("Καταχώρηση πληρωμής");
    expect(payments).toContain("FolioFiscalIssuePanel");
  });

  it("manual booking defaults to Active Property", () => {
    const manual = read("features/bookings/ManualBookingPage.tsx");
    expect(manual).toContain("useActiveProperty");
    expect(manual).toContain("activePropertyId");
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
