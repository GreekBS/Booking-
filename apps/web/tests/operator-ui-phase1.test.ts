import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Talos operator Phase 1 design system", () => {
  it("defines forest primary and warm background tokens", () => {
    const css = read("app/globals.css");
    expect(css).toContain("--primary: 153 43% 21%");
    expect(css).toContain("--background: 40 33% 95%");
    expect(css).toContain("--ops-booking:");
    expect(css).toContain("--ops-hold:");
    expect(css).toContain("--surface:");
  });

  it("wires Manrope/Fraunces on the dashboard layout", () => {
    const layout = read("app/(dashboard)/layout.tsx");
    expect(layout).toContain("Manrope");
    expect(layout).toContain("Fraunces");
    expect(layout).toContain("--font-talos-sans");
    expect(layout).toContain("--font-talos-display");
  });

  it("groups sidebar navigation into operational sections branded Talos", () => {
    const sidebar = read("components/admin/admin-sidebar.tsx");
    expect(sidebar).toContain("TALOS");
    expect(sidebar).not.toContain("HCP Admin");
    expect(sidebar).toContain('label: "Overview"');
    expect(sidebar).toContain('label: "Operations"');
    expect(sidebar).toContain('label: "Revenue"');
    expect(sidebar).toContain('label: "Distribution"');
    expect(sidebar).toContain('label: "Property"');
    expect(sidebar).toContain('label: "Administration"');
    expect(sidebar).toContain("/dashboard/fiscal-documents");
    expect(sidebar).toContain("/dashboard/bookings");
  });

  it("exposes Active Property on mobile header", () => {
    const header = read("components/admin/admin-header.tsx");
    expect(header).toContain("sm:hidden");
    expect(header).toContain("alwaysVisible");
    expect(header).toContain("compact");

    const selector = read("components/admin/active-property-selector.tsx");
    expect(selector).toContain("alwaysVisible");
    expect(selector).toContain('aria-label="Active property"');
    // Must not be desktop-only only
    expect(selector).toContain("alwaysVisible ? \"inline-flex\"");
  });

  it("rebuilds dashboard as operations board without duplicate activity", () => {
    const dash = read("features/dashboard/DashboardOverview.tsx");
    expect(dash).toContain("Today");
    expect(dash).toContain("arrivalsToday");
    expect(dash).toContain("departuresToday");
    expect(dash).toContain("inHouseToday");
    expect(dash).toContain("Recent reservations");
    expect(dash).toContain("Attention");
    expect(dash).toContain("New booking");
    expect(dash).not.toContain("Recent activity");
    expect(dash).not.toContain("New property");
    expect(dash).toContain("bookingId=");
    expect(dash).toMatch(/fetchDashboardOverview\(tenantId,\s*propertyId\)/);
  });

  it("preserves calendar immersive layout and does not rewrite calendar page", () => {
    const cal = read("features/extranet-calendar/ExtranetCalendarPage.tsx");
    expect(cal.length).toBeGreaterThan(100);
    const layout = read("app/(dashboard)/dashboard/availability/layout.tsx");
    expect(layout).toContain("ExtranetWorkspaceLayout");
  });
});
