import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PLATFORM_NAV_ITEMS,
  platformPageTitle,
} from "@/components/platform/nav";

describe("Platform Control Center Batch 3", () => {
  it("exposes Channels, Operations, Platform Health, Audit Log, and Settings", () => {
    expect(PLATFORM_NAV_ITEMS.map((i) => i.label)).toEqual([
      "Overview",
      "Tenants",
      "Properties",
      "Users",
      "Leads",
      "Channels",
      "Operations",
      "Platform Health",
      "Audit Log",
      "Settings",
    ]);
    expect(PLATFORM_NAV_ITEMS.some((i) => i.href === "/platform/audit")).toBe(
      true,
    );
    expect(PLATFORM_NAV_ITEMS.some((i) => i.href === "/platform/settings")).toBe(
      true,
    );
  });

  it("titles operational pages", () => {
    expect(platformPageTitle("/platform/channels")).toBe("Channels");
    expect(
      platformPageTitle(
        "/platform/channels/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/conn-1",
      ),
    ).toBe("Channel detail");
    expect(platformPageTitle("/platform/operations")).toBe("Operations");
    expect(platformPageTitle("/platform/health")).toBe("Platform Health");
  });

  it("wires read-only operational pages without mutation controls", () => {
    const channels = readFileSync(
      path.join(process.cwd(), "app/(platform)/platform/channels/page.tsx"),
      "utf8",
    );
    expect(channels).toContain("listPlatformChannelsUseCase");
    expect(channels).not.toContain("Replay");
    expect(channels).not.toContain("Retry");

    const detail = readFileSync(
      path.join(
        process.cwd(),
        "app/(platform)/platform/channels/[tenantId]/[connectionId]/page.tsx",
      ),
      "utf8",
    );
    expect(detail).toContain("getPlatformChannelDetailUseCase");
    expect(detail).toContain("opaque");
    expect(detail).not.toContain("credentialRef");
    expect(detail).not.toContain("rawPayload");

    const operations = readFileSync(
      path.join(process.cwd(), "app/(platform)/platform/operations/page.tsx"),
      "utf8",
    );
    expect(operations).toContain("listPlatformJobsUseCase");
    expect(operations).toContain("listPlatformInboxUseCase");
    expect(operations).toContain("listPlatformOutboxUseCase");
    expect(operations).toContain("No retry or mutation controls");
    expect(operations).not.toContain("Force Complete");
    expect(operations).not.toContain("method: \"DELETE\"");

    const health = readFileSync(
      path.join(process.cwd(), "app/(platform)/platform/health/page.tsx"),
      "utf8",
    );
    expect(health).toContain("getPlatformOperationsHealthUseCase");
    expect(health).not.toContain("99.99%");
    expect(health).not.toContain("All systems operational");
    expect(health).toContain("not an uptime");
  });

  it("keeps platform layout Super Admin gated", () => {
    const layout = readFileSync(
      path.join(process.cwd(), "app/(platform)/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("requireSuperAdmin");
  });
});
