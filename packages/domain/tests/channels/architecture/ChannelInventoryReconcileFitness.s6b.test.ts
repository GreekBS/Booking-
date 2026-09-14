import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const WEB_CONTAINER = join(
  process.cwd(),
  "..",
  "..",
  "apps",
  "web",
  "lib",
  "di",
  "container.ts",
);
const APPLY_STORE = join(
  process.cwd(),
  "..",
  "database",
  "src",
  "repositories",
  "channels",
  "ChannelInventoryReconciliationApplyStore.ts",
);

describe("P1-S6b architecture fitness", () => {
  it("registers typed reconcile outbox handler before LoggingHandler", () => {
    expect(existsSync(WEB_CONTAINER)).toBe(true);
    const source = readFileSync(WEB_CONTAINER, "utf8");
    const reconcileIdx = source.indexOf("new IcalInventoryReconcileOutboxHandler");
    const loggingIdx = source.indexOf("outboxHandlerRegistry.register(new LoggingHandler()");
    expect(reconcileIdx).toBeGreaterThan(-1);
    expect(loggingIdx).toBeGreaterThan(-1);
    expect(reconcileIdx).toBeLessThan(loggingIdx);
    expect(source).toMatch(/RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE|ReconcileIcalImportedInventoryJobHandler/);
    expect(source).toMatch(/SweepPendingIcalInventoryReconcile/);
    expect(source).toMatch(/ForceRedrivePendingIcalInventoryReconcileUseCase/);
  });

  it("TX2 apply store does not delete channel_import blocks", () => {
    expect(existsSync(APPLY_STORE)).toBe(true);
    const source = readFileSync(APPLY_STORE, "utf8");
    expect(source).not.toMatch(/DELETE FROM\s+"unit_calendar_blocks"/i);
    expect(source).not.toMatch(/unitCalendarBlock\.delete/i);
    expect(source).toMatch(/ON CONFLICT/);
    expect(source).toMatch(/channel_import/);
  });
});
