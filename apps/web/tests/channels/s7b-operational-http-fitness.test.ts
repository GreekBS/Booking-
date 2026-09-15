import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("P1-S7b operational HTTP fitness (web)", () => {
  it("schedule-ical-polls internal route uses BACKGROUND_JOBS_SECRET", () => {
    const route = join(
      process.cwd(),
      "app",
      "api",
      "internal",
      "v1",
      "channels",
      "schedule-ical-polls",
      "route.ts",
    );
    expect(existsSync(route)).toBe(true);
    const source = readFileSync(route, "utf8");
    expect(source).toMatch(/BACKGROUND_JOBS_SECRET/);
    expect(source).toMatch(/scheduleIcalPollsUseCase/);
    expect(source).not.toMatch(/feedUrl|credential|BEGIN:VCALENDAR/i);
  });

  it("ForceRedrive / health / inventory deactivate admin routes exist and gate operator API", () => {
    const base = join(process.cwd(), "app", "api", "admin", "v1", "channel-connections");
    const force = join(
      base,
      "[connectionId]",
      "reconciliations",
      "[cursorVersion]",
      "force-redrive",
      "route.ts",
    );
    const health = join(base, "[connectionId]", "health", "route.ts");
    const deactivate = join(base, "[connectionId]", "inventory", "deactivate", "route.ts");
    for (const path of [force, health, deactivate]) {
      expect(existsSync(path)).toBe(true);
      const source = readFileSync(path, "utf8");
      expect(source).toMatch(/isChannelOperatorApiEnabled/);
      expect(source).not.toMatch(/feedUrl|BEGIN:VCALENDAR/i);
    }
    const forceSource = readFileSync(force, "utf8");
    expect(forceSource).toMatch(/forceRedrivePendingIcalInventoryReconcileUseCase/);
    expect(forceSource).toMatch(/toPermissionActor/);
    expect(forceSource).not.toMatch(/auditLogRepository/);
    expect(forceSource).not.toMatch(/permissionChecker/);
    expect(readFileSync(health, "utf8")).toMatch(/getChannelConnectionHealthUseCase/);
    expect(readFileSync(deactivate, "utf8")).toMatch(
      /deactivateChannelConnectionInventoryUseCase/,
    );
  });

  it("container wires S7b pollJobQuery into enqueue and schedule/health/deactivate", () => {
    const container = join(process.cwd(), "lib", "di", "container.ts");
    const source = readFileSync(container, "utf8");
    expect(source).toMatch(/PrismaChannelPollJobQuery/);
    expect(source).toMatch(/scheduleIcalPollsUseCase/);
    expect(source).toMatch(/getChannelConnectionHealthUseCase/);
    expect(source).toMatch(/deactivateChannelConnectionInventoryUseCase/);
    expect(source).toMatch(/channelPollJobQuery/);
  });
});
