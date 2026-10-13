import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listBookingsQuerySchema } from "@hcp/validators";
import {
  ALL_BOOKING_STATUS_TABS,
  VISIBLE_BOOKING_STATUS_TABS,
  bookingsMatchStatusTab,
  buildBookingsStatusFixture,
  countFixtureByTab,
  filterBookingsByStatusTab,
  parseBookingStatusTab,
  statusTabToListParam,
} from "@/features/bookings/bookings-list-query";

const root = join(__dirname, "..");

function readWeb(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Bookings status tabs — seeded 23/2/17/4 filter contract", () => {
  const fixture = buildBookingsStatusFixture();

  it("fixture matches reported Production mix", () => {
    expect(fixture).toHaveLength(23);
    expect(countFixtureByTab(fixture, "all")).toBe(23);
    expect(countFixtureByTab(fixture, "confirmed")).toBe(2);
    expect(countFixtureByTab(fixture, "completed")).toBe(17);
    expect(countFixtureByTab(fixture, "cancelled")).toBe(4);
  });

  it("Active tab returns exactly confirmed rows — no cancelled", () => {
    const active = filterBookingsByStatusTab(fixture, "confirmed");
    expect(active).toHaveLength(2);
    expect(active.every((b) => b.status === "confirmed")).toBe(true);
    expect(active.some((b) => b.status === "cancelled")).toBe(false);
    expect(bookingsMatchStatusTab(active, "confirmed")).toBe(true);
    expect(bookingsMatchStatusTab(fixture, "confirmed")).toBe(false);
  });

  it("Completed / Cancelled / All tabs return exact subsets", () => {
    expect(filterBookingsByStatusTab(fixture, "completed")).toHaveLength(17);
    expect(filterBookingsByStatusTab(fixture, "cancelled")).toHaveLength(4);
    expect(filterBookingsByStatusTab(fixture, "all")).toHaveLength(23);
  });

  it("maps tabs to list API status params", () => {
    expect(statusTabToListParam("all")).toBeUndefined();
    expect(statusTabToListParam("confirmed")).toBe("confirmed");
    expect(statusTabToListParam("completed")).toBe("completed");
    expect(statusTabToListParam("cancelled")).toBe("cancelled");
    expect(statusTabToListParam("pending")).toBe("pending");
    expect(statusTabToListParam("payment_pending")).toBe("payment_pending");
  });

  it("list validator accepts status=confirmed and returns it for the API", () => {
    const parsed = listBookingsQuerySchema.parse({
      page: "1",
      limit: "15",
      status: "confirmed",
      excludeSuperseded: "true",
    });
    expect(parsed.status).toBe("confirmed");
    expect(parsed.page).toBe(1);
  });
});

describe("Bookings status tabs — visible set and legacy URLs", () => {
  it("shows only Όλες / Ενεργές / Ολοκληρωμένες / Ακυρωμένες", () => {
    expect([...VISIBLE_BOOKING_STATUS_TABS]).toEqual([
      "all",
      "confirmed",
      "completed",
      "cancelled",
    ]);
    expect(VISIBLE_BOOKING_STATUS_TABS).not.toContain("pending");
    expect(VISIBLE_BOOKING_STATUS_TABS).not.toContain("payment_pending");

    const tabs = readWeb("features/bookings/BookingStatusTabs.tsx");
    expect(tabs).toContain("VISIBLE_BOOKING_STATUS_TABS");
    expect(tabs).not.toMatch(/id:\s*"pending"/);
    expect(tabs).not.toMatch(/id:\s*"payment_pending"/);
    expect(tabs).not.toContain("overflow-x-auto");
  });

  it("still parses legacy pending / payment_pending URLs for API filtering", () => {
    expect(parseBookingStatusTab("pending")).toBe("pending");
    expect(parseBookingStatusTab("payment_pending")).toBe("payment_pending");
    expect(parseBookingStatusTab("confirmed")).toBe("confirmed");
    expect(parseBookingStatusTab("bogus")).toBe("all");
    expect(parseBookingStatusTab(null)).toBe("all");
    expect(ALL_BOOKING_STATUS_TABS).toContain("pending");
    expect(ALL_BOOKING_STATUS_TABS).toContain("payment_pending");
  });
});

describe("Bookings status tabs — page wiring guards stale rows", () => {
  it("cancels in-flight list fetches and hides rows until appliedStatus matches", () => {
    const page = readWeb("features/bookings/BookingsPage.tsx");
    expect(page).toContain("let cancelled = false");
    expect(page).toContain("if (cancelled) return");
    expect(page).toContain("statusTabToListParam");
    expect(page).toContain("appliedStatusTab");
    expect(page).toContain("resultsStaleForTab");
    expect(page).toContain("visibleBookings");
    expect(page).toContain("writingUrlRef");
    expect(page).toContain("setPage(1)");
    expect(page).toContain("changeStatusTab");
    // Clear-filters must not live in the primary tab/action row (layout shift).
    expect(page).toContain("sheetFiltersActive");
    expect(page).toMatch(/sheetFiltersActive \? \([\s\S]*clearFilters/);
  });

  it("desktop header keeps tabs left and Φίλτρα/Ανανέωση right without tab scrollbar", () => {
    const page = readWeb("features/bookings/BookingsPage.tsx");
    const tabs = readWeb("features/bookings/BookingStatusTabs.tsx");
    expect(page).toContain("md:flex-row md:items-center md:justify-between");
    expect(page).toContain("shrink-0 flex-wrap items-center gap-2 md:flex-nowrap");
    expect(tabs).toContain("md:overflow-visible");
    expect(tabs).toContain("h-9");
  });

  it("uses colored pills when idle and soft tinted rectangles when selected", () => {
    const tabs = readWeb("features/bookings/BookingStatusTabs.tsx");
    expect(tabs).toContain("toneIdle");
    expect(tabs).toContain("toneSelected");
    expect(tabs).toContain("toneCountIdle");
    expect(tabs).toContain("toneCountSelected");
    // Exactly four visible tones — no pending/payment_pending buttons.
    expect(tabs).toContain('label: "Όλες"');
    expect(tabs).toContain('tone: "info"');
    expect(tabs).toContain('tone: "success"');
    expect(tabs).toContain('tone: "destructive"');
    // Idle = rounded-full pills with status-colored borders/tints.
    expect(tabs).toContain('selected ? "rounded-md" : "rounded-full"');
    expect(tabs).toContain("border-info/40");
    expect(tabs).toContain("border-success/40");
    expect(tabs).toContain("border-destructive/40");
    expect(tabs).toContain("bg-info-subtle");
    expect(tabs).toContain("bg-success-subtle");
    expect(tabs).toContain("bg-destructive/10");
    // Selected = no decorative outline/ring/shadow; keep status colors (not inverse black).
    expect(tabs).toContain("border-transparent");
    expect(tabs).toContain("font-semibold");
    expect(tabs).toContain("bg-muted text-foreground");
    expect(tabs).toContain("bg-info-subtle text-info");
    expect(tabs).toContain("bg-success-subtle text-success");
    expect(tabs).toContain("bg-destructive/15 text-destructive");
    expect(tabs).not.toContain("bg-foreground text-background");
    expect(tabs).not.toContain("shadow-sm");
    expect(tabs).not.toMatch(/toneSelected[\s\S]*ring-1/);
    // Count badges stay rounded; keyboard focus retained.
    expect(tabs).toContain("rounded-full px-1.5");
    expect(tabs).toContain("focus-visible:ring-2");
    expect(tabs).toContain("aria-selected={selected}");
    expect(tabs).toContain('data-selected={selected ? "true" : "false"}');
    expect(tabs).toContain("data-tone={meta.tone}");
  });
});
