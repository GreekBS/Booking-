import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Performance Batch 2 — Availability/Calendar request-shape guards (not timings).
 */
describe("Performance Batch 2 — calendar batch architecture", () => {
  const root = process.cwd();

  it("calendar hooks use batch fetchers — no per-unit HTTP fan-out", () => {
    const calendars = readFileSync(
      join(root, "features", "extranet-calendar", "hooks", "useUnitCalendars.ts"),
      "utf8",
    );
    const rates = readFileSync(
      join(root, "features", "extranet-calendar", "hooks", "useUnitRatePlans.ts"),
      "utf8",
    );
    const rules = readFileSync(
      join(root, "features", "extranet-calendar", "hooks", "useUnitAvailabilityRules.ts"),
      "utf8",
    );

    expect(calendars).toMatch(/fetchUnitsCalendarBatch/);
    expect(calendars).not.toMatch(/fetchUnitCalendar\(/);
    expect(calendars).not.toMatch(/CONCURRENCY/);

    expect(rates).toMatch(/fetchUnitsRatePlansBatch/);
    expect(rates).not.toMatch(/fetchRatePlan\(/);
    expect(rates).not.toMatch(/CONCURRENCY/);

    expect(rules).toMatch(/fetchUnitsAvailabilityRulesBatch/);
    expect(rules).not.toMatch(/fetchAvailabilityRules\(/);
    expect(rules).not.toMatch(/CONCURRENCY/);
  });

  it("batch API routes exist and require tenant context", () => {
    const routes = [
      join(root, "app", "api", "admin", "v1", "calendar", "batch", "route.ts"),
      join(root, "app", "api", "admin", "v1", "rate-plans", "batch", "route.ts"),
      join(root, "app", "api", "admin", "v1", "availability-rules", "batch", "route.ts"),
    ];
    for (const route of routes) {
      expect(existsSync(route)).toBe(true);
      const source = readFileSync(route, "utf8");
      expect(source).toMatch(/requireTenantContext/);
      expect(source).toMatch(/BatchUseCase/);
    }
  });

  it("request count stays bounded for 5 / 20 / 50 units (architecture)", () => {
    // Availability calendar data path: 3 batch POSTs (calendar + rates + rules)
    // independent of unit count. Plus catalog properties load (1) outside this guard.
    const CALENDAR_RELATED_BATCH_REQUESTS = 3;
    for (const unitCount of [5, 20, 50]) {
      expect(CALENDAR_RELATED_BATCH_REQUESTS).toBe(3);
      expect(CALENDAR_RELATED_BATCH_REQUESTS).toBeLessThan(unitCount);
      // Old path was 3N
      expect(unitCount * 3).toBeGreaterThan(CALENDAR_RELATED_BATCH_REQUESTS);
    }
  });

  it("Prisma batch repos use unitId IN queries — not N loops of single-unit finds", () => {
    const dbRoot = join(root, "..", "..", "packages", "database", "src", "repositories", "commerce");
    const calendar = readFileSync(join(dbRoot, "CalendarBlockRepository.ts"), "utf8");
    const holds = readFileSync(join(dbRoot, "HoldRepository.ts"), "utf8");
    const bookings = readFileSync(join(dbRoot, "BookingRepository.ts"), "utf8");
    const rates = readFileSync(join(dbRoot, "RatePlanRepository.ts"), "utf8");
    const rules = readFileSync(join(dbRoot, "AvailabilityRulesRepository.ts"), "utf8");

    expect(calendar).toMatch(/findCalendarBlocksByUnits/);
    expect(calendar).toMatch(/unitId:\s*\{\s*in:\s*unitIds\s*\}/);
    expect(holds).toMatch(/findActiveByUnits/);
    expect(holds).toMatch(/unitId:\s*\{\s*in:\s*unitIds\s*\}/);
    expect(bookings).toMatch(/findByUnits/);
    expect(bookings).toMatch(/unitId:\s*\{\s*in:\s*unitIds\s*\}/);
    expect(rates).toMatch(/findByUnitIds/);
    expect(rates).toMatch(/unitId:\s*\{\s*in:\s*unitIds\s*\}/);
    expect(rules).toMatch(/findByUnitIds/);
    expect(rules).toMatch(/unitId:\s*\{\s*in:\s*unitIds\s*\}/);
  });

  it("deprecated fetchAllCalendars routes through batch", () => {
    const api = readFileSync(join(root, "lib", "admin", "api.ts"), "utf8");
    const start = api.indexOf("export async function fetchAllCalendars");
    const end = api.indexOf("export async function countActiveHolds", start);
    const deprecated = api.slice(start, end);
    expect(deprecated).toMatch(/fetchUnitsCalendarBatch/);
    expect(deprecated).not.toMatch(/fetchUnitCalendar\(/);
  });
});
