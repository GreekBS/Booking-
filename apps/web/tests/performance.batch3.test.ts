import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Performance Batch 3 — auth request memoization, overview dedupe,
 * Availability slim catalog, operator-read batch semantics (source guards).
 */
describe("Performance Batch 3 — runtime bottleneck fixes", () => {
  const root = process.cwd();

  it("tenant-context uses React cache for request-scoped session/tenant memoization", () => {
    const source = readFileSync(join(root, "lib", "tenant-context.ts"), "utf8");
    expect(source).toMatch(/import\s+\{\s*cache\s*\}\s+from\s+["']react["']/);
    expect(source).toMatch(/export const getAuthSession = cache\(/);
    expect(source).toMatch(/export const requireSession = cache\(/);
    expect(source).toMatch(/export const requireTenantContext = cache\(/);
    // DB remains authoritative — no JWT privilege shortcut
    expect(source).toMatch(/userRepository\.findById/);
    expect(source).toMatch(/platformRole = user\.platformRole/);
  });

  it("dashboard layout reuses getAuthSession + requireSession (no raw auth() bypass)", () => {
    const source = readFileSync(
      join(root, "app", "(dashboard)", "layout.tsx"),
      "utf8",
    );
    expect(source).toMatch(/getAuthSession/);
    expect(source).toMatch(/requireSession/);
    expect(source).not.toMatch(/from ["']@\/lib\/auth\/config["']/);
  });

  it("fetchDashboardOverview dedupes concurrent in-flight requests", () => {
    const source = readFileSync(join(root, "lib", "admin", "api.ts"), "utf8");
    expect(source).toMatch(/overviewInflight/);
    expect(source).toMatch(/export async function fetchDashboardOverview/);
    expect(source).toMatch(/overviewInflight\.get\(tenantId\)/);
    expect(source).toMatch(/overviewInflight\.delete\(tenantId\)/);
  });

  it("DashboardOverview loads overview once per tenantId (single fetch effect)", () => {
    const source = readFileSync(
      join(root, "features", "dashboard", "DashboardOverview.tsx"),
      "utf8",
    );
    const fetchCalls = source.match(/fetchDashboardOverview/g) ?? [];
    expect(fetchCalls.length).toBe(2); // import + one call site
    expect(source).toMatch(/}, \[tenantId\]\);/);
  });

  it("Availability uses slim catalog + batch hooks (not full properties)", () => {
    const page = readFileSync(
      join(root, "features", "extranet-calendar", "ExtranetCalendarPage.tsx"),
      "utf8",
    );
    expect(page).toMatch(/fetchPropertyUnitCatalog/);
    expect(page).not.toMatch(/fetchAllProperties/);
    expect(page).not.toMatch(/\/properties\?limit=/);

    const calendars = readFileSync(
      join(root, "features", "extranet-calendar", "hooks", "useUnitCalendars.ts"),
      "utf8",
    );
    const rates = readFileSync(
      join(root, "features", "extranet-calendar", "hooks", "useUnitRatePlans.ts"),
      "utf8",
    );
    const rules = readFileSync(
      join(
        root,
        "features",
        "extranet-calendar",
        "hooks",
        "useUnitAvailabilityRules.ts",
      ),
      "utf8",
    );
    expect(calendars).toMatch(/fetchUnitsCalendarBatch/);
    expect(rates).toMatch(/fetchUnitsRatePlansBatch/);
    expect(rules).toMatch(/fetchUnitsAvailabilityRulesBatch/);
  });

  it("Pricing retains selected-unit rate-plan GET (editor needs full plan; not N-fan-out)", () => {
    const source = readFileSync(
      join(root, "features", "pricing", "PricingPage.tsx"),
      "utf8",
    );
    expect(source).toMatch(/fetchPropertyUnitCatalog/);
    expect(source).toMatch(/\/units\/\$\{unitId\}\/rate-plan/);
    expect(source).not.toMatch(/\/rate-plans\/batch/);
  });

  it("operator reads allow inactive units; booking writes keep strict active check", () => {
    const access = readFileSync(
      join(
        root,
        "..",
        "..",
        "packages",
        "domain",
        "src",
        "commerce",
        "application",
        "commerceAccess.ts",
      ),
      "utf8",
    );
    expect(access).toMatch(/resolveUnitContextForOperatorRead/);
    expect(access).toMatch(/requireActiveForBooking: false/);
    expect(access).toMatch(/requireActiveForBooking: true/);

    const batch = readFileSync(
      join(
        root,
        "..",
        "..",
        "packages",
        "domain",
        "src",
        "commerce",
        "application",
        "BatchCalendarReadUseCases.ts",
      ),
      "utf8",
    );
    expect(batch).toMatch(/Inactive units are allowed/);
    expect(batch).not.toMatch(/Unit is not available for booking/);
  });
});
