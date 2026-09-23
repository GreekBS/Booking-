import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Performance Batch 1 regression guards — request/query shape, not timings.
 */
describe("Performance Batch 1 — dashboard overview / slim catalog", () => {
  const root = process.cwd();

  it("DashboardOverview uses single overview fetch — no quote-per-booking", () => {
    const source = readFileSync(
      join(root, "features", "dashboard", "DashboardOverview.tsx"),
      "utf8",
    );
    expect(source).toMatch(/fetchDashboardOverview/);
    expect(source).not.toMatch(/fetchQuote/);
    expect(source).not.toMatch(/fetchAllProperties/);
    expect(source).not.toMatch(/searchBookings/);
    expect(source).not.toMatch(/countActiveHolds/);
    expect(source).not.toMatch(/estimateRevenueFromBookings/);
    expect(source).not.toMatch(/\/quotes\//);
  });

  it("overview API route is tenant-gated and wires dedicated use case", () => {
    const route = join(
      root,
      "app",
      "api",
      "admin",
      "v1",
      "dashboard",
      "overview",
      "route.ts",
    );
    expect(existsSync(route)).toBe(true);
    const source = readFileSync(route, "utf8");
    expect(source).toMatch(/requireTenantContext/);
    expect(source).toMatch(/getTenantDashboardOverviewUseCase/);
    expect(source).not.toMatch(/fetchQuote|quoteRepository|\/quotes\//);
  });

  it("slim catalog API route is tenant-gated and separate from full properties", () => {
    const catalogRoute = join(
      root,
      "app",
      "api",
      "admin",
      "v1",
      "catalog",
      "properties-units",
      "route.ts",
    );
    const propertiesRoute = join(
      root,
      "app",
      "api",
      "admin",
      "v1",
      "properties",
      "route.ts",
    );
    expect(existsSync(catalogRoute)).toBe(true);
    const catalog = readFileSync(catalogRoute, "utf8");
    const properties = readFileSync(propertiesRoute, "utf8");
    expect(catalog).toMatch(/requireTenantContext/);
    expect(catalog).toMatch(/listPropertyUnitCatalogUseCase/);
    expect(properties).toMatch(/listPropertiesUseCase/);
    expect(properties).toMatch(/serializeProperty/);
    expect(catalog).not.toMatch(/serializeProperty/);
  });

  it("Prisma overview query never touches Quote tables", () => {
    const source = readFileSync(
      join(
        root,
        "..",
        "..",
        "packages",
        "database",
        "src",
        "repositories",
        "commerce",
        "TenantDashboardOverviewQuery.ts",
      ),
      "utf8",
    );
    expect(source).toMatch(/Promise\.all/);
    expect(source).toMatch(/bookingHold\.count/);
    expect(source).toMatch(/_sum:\s*\{\s*totalAmount/);
    expect(source).not.toMatch(/prisma\.quote/i);
    expect(source).not.toMatch(/include:\s*\{[^}]*quote/i);
  });

  it("dashboard loading boundary exists", () => {
    expect(
      existsSync(join(root, "app", "(dashboard)", "loading.tsx")),
    ).toBe(true);
  });

  it("high-frequency picker pages adopt slim catalog", () => {
    const pages = [
      join(root, "features", "bookings", "BookingsPage.tsx"),
      join(root, "features", "bookings", "ManualBookingPage.tsx"),
      join(root, "features", "pricing", "PricingPage.tsx"),
      join(root, "features", "members", "MembersPage.tsx"),
    ];
    for (const page of pages) {
      const source = readFileSync(page, "utf8");
      expect(source).toMatch(/fetchPropertyUnitCatalog/);
      expect(source).not.toMatch(/fetchAllProperties/);
    }
  });

  it("detailed property consumers still use full property load", () => {
    const pages = [
      join(root, "features", "properties", "PropertiesPage.tsx"),
      join(root, "features", "units", "UnitsPage.tsx"),
      join(root, "features", "policies", "PoliciesPage.tsx"),
    ];
    for (const page of pages) {
      const source = readFileSync(page, "utf8");
      expect(source).toMatch(/fetchAllProperties/);
    }
  });
});
