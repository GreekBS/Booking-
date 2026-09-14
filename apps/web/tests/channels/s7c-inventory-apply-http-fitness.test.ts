import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("P1-S7c inventory-apply HTTP fitness (web)", () => {
  it("enable/disable admin routes exist and gate operator API + auth", () => {
    const base = join(
      process.cwd(),
      "app",
      "api",
      "admin",
      "v1",
      "channel-connections",
      "[connectionId]",
      "inventory-apply",
    );
    const enable = join(base, "enable", "route.ts");
    const disable = join(base, "disable", "route.ts");

    for (const path of [enable, disable]) {
      expect(existsSync(path)).toBe(true);
      const source = readFileSync(path, "utf8");
      expect(source).toMatch(/isChannelOperatorApiEnabled/);
      expect(source).toMatch(/requireTenantContext/);
      expect(source).toMatch(/expectedSemanticConfigVersion/);
      expect(source).not.toMatch(/feedUrl|BEGIN:VCALENDAR|credentialRef/i);
    }

    expect(readFileSync(enable, "utf8")).toMatch(
      /enableChannelConnectionInventoryApplyUseCase/,
    );
    expect(readFileSync(disable, "utf8")).toMatch(
      /disableChannelConnectionInventoryApplyUseCase/,
    );
  });

  it("container wires enable/disable inventory apply use cases + store", () => {
    const container = join(process.cwd(), "lib", "di", "container.ts");
    const source = readFileSync(container, "utf8");
    expect(source).toMatch(/PrismaChannelConnectionInventoryApplyStore/);
    expect(source).toMatch(/enableChannelConnectionInventoryApplyUseCase/);
    expect(source).toMatch(/disableChannelConnectionInventoryApplyUseCase/);
    expect(source).toMatch(/EnableChannelConnectionInventoryApplyUseCase/);
    expect(source).toMatch(/DisableChannelConnectionInventoryApplyUseCase/);
  });
});
