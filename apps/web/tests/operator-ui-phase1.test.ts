import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Talos operator Phase 1 design system", () => {
  it("defines cool canvas + blue primary while keeping inventory ops-* independent", () => {
    const css = read("app/globals.css");
    expect(css).toContain("--primary: 217 91% 53%");
    expect(css).toContain("--primary-hover: 224 76% 48%");
    expect(css).toContain("--primary-subtle: 214 95% 93%");
    expect(css).toContain("--background: 220 33% 98%");
    expect(css).toContain("--foreground: 222 36% 15%");
    expect(css).toContain("--border: 214 32% 91%");
    expect(css).toContain("--ops-booking: 153 43% 28%");
    expect(css).toContain("--ops-booking-subtle:");
    expect(css).toContain("--ops-hold:");
    expect(css).toContain("--ops-selected: 214 95% 93%");
    expect(css).toContain("--ops-selected-ring: 217 91% 53%");
    expect(css).toContain("--surface:");
    // Inventory booking must not collapse into CTA primary.
    expect(css).not.toMatch(/--ops-booking:\s*217 91% 53%/);
    expect(css.indexOf("--ops-booking: 153 43% 28%")).toBeGreaterThan(-1);
  });

  it("keeps shell content pad and immersive bleed on the same contract", () => {
    const spacing = read("components/admin/shell-spacing.ts");
    expect(spacing).toContain('SHELL_CONTENT_PAD = "p-4 md:p-5 lg:p-6"');
    expect(spacing).toContain('SHELL_CONTENT_BLEED = "-m-4 md:-m-5 lg:-m-6"');
    expect(spacing).toContain("SHELL_CONTENT_BLEED_X");

    const shell = read("components/admin/admin-shell.tsx");
    expect(shell).toContain("SHELL_CONTENT_PAD");

    const immersive = read(
      "features/extranet-calendar/components/shell/ExtranetWorkspaceLayout.tsx",
    );
    expect(immersive).toContain("SHELL_CONTENT_BLEED");
    expect(immersive).not.toContain("lg:-m-8");

    const toolbar = read("components/admin/sticky-toolbar.tsx");
    expect(toolbar).toContain("SHELL_CONTENT_BLEED_X");
    expect(toolbar).not.toContain("lg:-mx-8");
  });

  it("wires focus-visible ring convention on shared primitives", () => {
    const focus = read("components/ui/focus-ring.ts");
    expect(focus).toContain("focus-visible:ring-2");
    expect(focus).toContain("focus-visible:ring-ring");

    const select = read("components/ui/select.tsx");
    expect(select).toContain("FOCUS_RING_CLASS");
    expect(select).not.toContain("focus:ring-2");

    const badge = read("components/ui/badge.tsx");
    expect(badge).toContain("FOCUS_RING_CLASS");
    expect(badge).toContain("bg-success-subtle");
    expect(badge).not.toContain("bg-emerald-");
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
    expect(sidebar).toContain(`label: elNav.overview`);
    expect(sidebar).toContain(`label: elNav.operations`);
    expect(sidebar).toContain(`label: elNav.revenue`);
    expect(sidebar).toContain(`label: elNav.distribution`);
    expect(sidebar).toContain(`label: elNav.property`);
    expect(sidebar).toContain(`label: elNav.administration`);
    expect(sidebar).toContain("/dashboard/fiscal-documents");
    expect(sidebar).toContain("/dashboard/bookings");
    expect(sidebar).toContain("sidebar-nav-scroll");
    expect(sidebar).toContain("overflow-hidden");
    expect(sidebar).toContain("text-sidebar-primary");
    expect(sidebar).toContain("text-sm font-medium");
    expect(sidebar).toContain("text-[12px] font-semibold uppercase");
    expect(sidebar).toContain("bg-sidebar-accent text-sidebar-accent-foreground");
    expect(sidebar).toContain("hover:bg-sidebar-accent/30");
    expect(sidebar).toContain("hover:text-sidebar-foreground");
    expect(sidebar).toContain("focus-visible:ring-sidebar-ring");
    expect(sidebar).not.toContain("text-white");

    const shell = read("components/admin/admin-shell.tsx");
    expect(shell).toContain("lg:pl-3");
    expect(shell).toContain("lg:bg-[hsl(var(--sidebar-rail))]");
    expect(shell).not.toContain("lg:pl-5");
    // Outer rail is confined to the sticky desktop sidebar column (not root bg).
    expect(shell).toMatch(
      /sticky top-0 lg:block lg:bg-\[hsl\(var\(--sidebar-rail\)\)\] lg:pl-3/,
    );
    expect(shell).toContain('flex min-h-screen bg-background font-sans">');

    const css = read("app/globals.css");
    expect(css).toContain(".sidebar-nav-scroll");
    expect(css).toContain("scrollbar-width: thin");
    expect(css).toContain("::-webkit-scrollbar");
    // UI-3 calm muted blue sidebar (not white UI-2, not forest, not CTA primary)
    expect(css).toContain("--sidebar-background: 211 57% 31%");
    expect(css).toContain("--sidebar-foreground: 210 40% 94%");
    expect(css).toContain("--sidebar-primary: 210 40% 98%");
    expect(css).toContain("--sidebar-accent: 211 52% 42%");
    expect(css).toContain("--sidebar-accent-foreground: 0 0% 100%");
    expect(css).toContain("--sidebar-border: 211 40% 24%");
    expect(css).toContain("--sidebar-ring: 213 94% 78%");
    expect(css).toContain("--sidebar-muted: 210 25% 72%");
    expect(css).toContain("--sidebar-rail: 211 61% 23%");
    expect(css).not.toContain("--sidebar-background: 0 0% 100%");
    expect(css).not.toContain("--sidebar-background: 153 43% 14%");
    expect(css).not.toMatch(/--sidebar-background:\s*217 91% 53%/);
  });

  it("exposes Active Property on mobile header", () => {
    const header = read("components/admin/admin-header.tsx");
    expect(header).toContain("sm:hidden");
    expect(header).toContain("alwaysVisible");
    expect(header).toContain("compact");

    const selector = read("components/admin/active-property-selector.tsx");
    expect(selector).toContain("alwaysVisible");
    expect(selector).toContain("elCommon.activeProperty");
    // Must not be desktop-only only
    expect(selector).toContain("alwaysVisible ? \"inline-flex\"");
  });

  it("rebuilds dashboard as operations board without duplicate activity", () => {
    const dash = read("features/dashboard/DashboardOverview.tsx");
    expect(dash).toContain("elCommon.today");
    expect(dash).toContain("arrivalsToday");
    expect(dash).toContain("departuresToday");
    expect(dash).toContain("inHouseToday");
    expect(dash).toContain("Πρόσφατες κρατήσεις");
    expect(dash).toContain("Προσοχή");
    expect(dash).toContain("Νέα κράτηση");
    expect(dash).not.toContain("Recent activity");
    expect(dash).not.toContain("New property");
    expect(dash).toContain("bookingId=");
    expect(dash).toMatch(/fetchDashboardOverview\(tenantId,\s*propertyId/);
    expect(dash).toContain("DashboardPeriodControl");
    expect(dash).toContain("periodAnalytics");
    expect(dash).toContain("ADR");
  });

  it("shows a first-property CTA on the zero-property dashboard state", () => {
    const dash = read("features/dashboard/DashboardOverview.tsx");
    expect(dash).toContain("properties.length === 0");
    expect(dash).toContain("Δημιουργήστε το πρώτο σας κατάλυμα");
    expect(dash).toContain('/dashboard/properties/new');
    expect(dash).toContain("Καλώς ήρθατε στο Talos");
  });

  it("preserves calendar immersive layout and does not rewrite calendar page", () => {
    const cal = read("features/extranet-calendar/ExtranetCalendarPage.tsx");
    expect(cal.length).toBeGreaterThan(100);
    const layout = read("app/(dashboard)/dashboard/availability/layout.tsx");
    expect(layout).toContain("ExtranetWorkspaceLayout");
  });
});
