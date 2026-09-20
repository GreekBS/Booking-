import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PLATFORM_NAV_ITEMS,
  isPlatformNavActive,
  platformPageTitle,
  resolvePlatformEnvironment,
} from "@/components/platform/nav";

describe("Platform Control Center Batch 1", () => {
  it("exposes Batch 1 core nav items that remain in later batches", () => {
    expect(PLATFORM_NAV_ITEMS.map((i) => i.label)).toEqual([
      "Overview",
      "Tenants",
      "Properties",
      "Users",
      "Leads",
      "Channels",
      "Operations",
      "Platform Health",
    ]);
    expect(PLATFORM_NAV_ITEMS.some((i) => i.href === "/platform/audit")).toBe(
      false,
    );
  });

  it("marks active routes correctly", () => {
    expect(isPlatformNavActive("/platform", "/platform", true)).toBe(true);
    expect(isPlatformNavActive("/platform/tenants", "/platform", true)).toBe(
      false,
    );
    expect(isPlatformNavActive("/platform/leads/abc", "/platform/leads")).toBe(
      true,
    );
  });

  it("titles pages for the shell header", () => {
    expect(platformPageTitle("/platform")).toBe("Overview");
    expect(platformPageTitle("/platform/leads")).toBe("Leads");
    expect(platformPageTitle("/platform/leads/x")).toBe("Lead detail");
    expect(platformPageTitle("/platform/tenants/new")).toBe("Create tenant");
  });

  it("uses shell layout and overview page wiring", () => {
    const layout = readFileSync(
      path.join(process.cwd(), "app/(platform)/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("requireSuperAdmin");
    expect(layout).toContain("PlatformShell");

    const overview = readFileSync(
      path.join(process.cwd(), "app/(platform)/platform/page.tsx"),
      "utf8",
    );
    expect(overview).toContain("getPlatformOverviewUseCase");
    expect(overview).toContain("Needs attention");
    expect(overview).not.toContain("fake");
    expect(overview).not.toContain("Math.random");
  });

  it("resolves environment without exposing secrets", () => {
    const env = resolvePlatformEnvironment();
    expect(["production", "preview", "development"]).toContain(env);
  });
});
