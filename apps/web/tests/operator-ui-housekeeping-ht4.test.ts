import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("operator-ui housekeeping HT-4", () => {
  it("Dashboard surfaces housekeeping signals from Today read model", () => {
    const page = read("features/dashboard/DashboardOverview.tsx");
    expect(page).toContain("fetchHousekeepingToday");
    expect(page).toContain("HousekeepingSignal");
    expect(page).toContain("/dashboard/housekeeping");
    expect(page).toContain("βρώμικ");
    expect(page).toContain("εκπρόθεσμ");
    expect(page).toContain("useActiveProperty");
  });

  it("Booking workspace exposes operational tasks with deep-links", () => {
    const view = read("features/bookings/workspace/BookingWorkspaceView.tsx");
    expect(view).toContain("BookingOperationsTasksSection");
    const section = read(
      "features/bookings/workspace/sections/BookingOperationsTasksSection.tsx",
    );
    expect(section).toContain("listTasks");
    expect(section).toContain("bookingId");
    expect(section).toContain("Όλες οι εργασίες");
    expect(section).toContain("Δημιουργία εργασίας");
    expect(section).toContain("Λειτουργικές εργασίες");
    expect(section).toContain("Δεν υπάρχουν ανοιχτές λειτουργικές εργασίες");
    expect(section).toContain("min-h-8");
  });

  it("Housekeeping honors bookingId server filter and create presets", () => {
    const page = read("features/housekeeping/HousekeepingPage.tsx");
    expect(page).toContain("filterBookingId");
    expect(page).toContain("bookingId: filterBookingId");
    expect(page).toContain('viewParam === "all" || viewParam === "tasks"');
    expect(page).toContain('searchParams.get("create") === "1"');
    expect(page).toContain("initialBookingId");
    expect(page).toContain("/dashboard/bookings?bookingId=");
  });
});
