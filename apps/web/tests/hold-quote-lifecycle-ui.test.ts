import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Hold / quote lifecycle operator wiring", () => {
  it("pricing preview API client hits read-only pricing route only", () => {
    const api = read("lib/admin/api.ts");
    const fn = api.slice(api.indexOf("export async function previewQuoteForStay"));
    const end = fn.indexOf("export async function createBookingFromQuote");
    const body = end > 0 ? fn.slice(0, end) : fn.slice(0, 800);
    expect(body).toContain("/pricing/preview");
    expect(body).not.toContain("/holds");
    expect(body).not.toContain("/quotes");
  });

  it("manual booking uses read-only preview, then single create path", () => {
    const page = read("features/bookings/ManualBookingPage.tsx");
    expect(page).toContain("previewQuoteForStay");
    expect(page).toContain("createManualBooking");
    expect(page).toContain("createBookingFromQuote");
    expect(page).toContain("quoteId");
    expect(page).toContain("Price preview is read-only");
    // Must not POST /holds inside generateQuote for preview
    expect(page).not.toMatch(/generateQuote[\s\S]*?\/holds/);
  });

  it("Hold convert navigates with quoteId for consumption", () => {
    const panel = read(
      "features/extranet-calendar/components/workspace-panels/HoldWorkspacePanel.tsx",
    );
    const drawer = read(
      "features/availability/components/drawers/HoldDetailDrawer.tsx",
    );
    expect(panel).toContain("quoteId=");
    expect(drawer).toContain("quoteId=");
    expect(panel).not.toMatch(/router\.push\("\/dashboard\/bookings\/new"\)/);
    expect(drawer).not.toMatch(/router\.push\("\/dashboard\/bookings\/new"\)/);
  });

  it("pricing preview API route is inventory-safe", () => {
    const route = read("app/api/admin/v1/pricing/preview/route.ts");
    expect(route).toContain("previewStayPricingUseCase");
    expect(route).toContain("inventoryMutating: false");
    expect(route).not.toContain("createHoldUseCase");
    expect(route).not.toContain("createQuoteUseCase");
  });
});
