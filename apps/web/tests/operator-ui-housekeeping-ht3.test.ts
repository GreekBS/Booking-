import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("operator-ui housekeeping HT-3", () => {
  it("sidebar includes Housekeeping under Operations", () => {
    const sidebar = read("components/admin/admin-sidebar.tsx");
    expect(sidebar).toContain("/dashboard/housekeeping");
    expect(sidebar).toContain("elNav.housekeeping");
    expect(sidebar).toContain("ClipboardList");
  });

  it("Housekeeping page is Active Property gated with Today board", () => {
    const page = read("features/housekeeping/HousekeepingPage.tsx");
    expect(page).toContain("useActiveProperty");
    expect(page).toContain("renderActivePropertyGate");
    expect(page).toContain("PageHeader");
    expect(page).toContain("fetchHousekeepingToday");
    expect(page).toContain("Χρειάζεται καθαρισμός");
    expect(page).toContain("Σε εξέλιξη");
    expect(page).toContain("Έτοιμα για άφιξη");
    expect(page).toContain("Δημιουργία εργασίας");
    expect(page).toContain("min-h-10");
    expect(page).toContain("md:hidden");
    expect(page).toContain("Η σήμανση ως καθαρό δεν ολοκληρώνει ανοιχτή εργασία καθαριότητας");
    expect(page).not.toContain("/dashboard/tasks");
  });

  it("route page exists", () => {
    const route = read("app/(dashboard)/dashboard/housekeeping/page.tsx");
    expect(route).toContain("HousekeepingPage");
  });

  it("today API route exists", () => {
    const api = read("app/api/admin/v1/housekeeping/today/route.ts");
    expect(api).toContain("getHousekeepingTodayUseCase");
    expect(api).toContain("propertyId");
  });
});
