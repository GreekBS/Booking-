import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { serializeOperatorConnection } from "@/lib/channels/operator-connection-response";
import type { ChannelConnectionOperatorReadModel } from "@hcp/domain";
import { adminNavItems } from "@/components/admin/admin-sidebar";

const ROOT = process.cwd();

describe("tenant channel operator UI fitness", () => {
  it("adds Channels to tenant dashboard nav (not platform)", () => {
    expect(adminNavItems.some((i) => i.href === "/dashboard/channels")).toBe(true);
    const platformChannels = join(
      ROOT,
      "app",
      "(platform)",
      "platform",
      "channels",
      "page.tsx",
    );
    expect(existsSync(platformChannels)).toBe(true);
    const platformSrc = readFileSync(platformChannels, "utf8");
    expect(platformSrc).toContain("read-only");
  });

  it("exposes tenant dashboard channel pages", () => {
    expect(
      existsSync(join(ROOT, "app", "(dashboard)", "dashboard", "channels", "page.tsx")),
    ).toBe(true);
    expect(
      existsSync(
        join(
          ROOT,
          "app",
          "(dashboard)",
          "dashboard",
          "channels",
          "[connectionId]",
          "page.tsx",
        ),
      ),
    ).toBe(true);
  });

  it("UI reuses existing admin channel APIs and never renders stored feed URLs", () => {
    const api = readFileSync(join(ROOT, "features", "channels", "channel-api.ts"), "utf8");
    expect(api).toContain("/channel-connections");
    expect(api).toContain("/credentials");
    expect(api).toContain("/semantic-mode");
    expect(api).toContain("/mappings");
    expect(api).toContain("/activate");
    expect(api).toContain("/inventory-apply/enable");
    expect(api).toContain("/poll");
    expect(api).toContain("/disconnect");
    expect(api).toContain("/inventory/deactivate");
    expect(api).not.toMatch(/GET.*credentials/i);

    const detail = readFileSync(
      join(ROOT, "features", "channels", "ChannelDetailPage.tsx"),
      "utf8",
    );
    expect(detail).toContain(
      "Talos uses this calendar feed to block externally reserved dates",
    );
    expect(detail).toContain("opaque");
    expect(detail).not.toMatch(/connection\.feedUrl/);
    expect(detail).not.toMatch(/health\.feedUrl/);
    expect(detail).not.toMatch(/storedFeedUrl/);
  });

  it("serializeOperatorConnection includes inventoryApplyEnabled and omits secrets", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const model: ChannelConnectionOperatorReadModel = {
      connectionId: "c1",
      tenantId: "t1",
      provider: "ical",
      displayName: "Pilot",
      status: "active",
      semanticMode: "availability_block_feed",
      semanticConfigVersion: 2,
      inventoryApplyEnabled: true,
      hasCredentialRef: true,
      hasWebhookVerificationRef: false,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    const json = serializeOperatorConnection(model);
    expect(json.inventoryApplyEnabled).toBe(true);
    expect(json).not.toHaveProperty("feedUrl");
    expect(json).not.toHaveProperty("material");
    expect(json).not.toHaveProperty("credentialRef");
    expect(JSON.stringify(json)).not.toMatch(/feedUrl/i);
  });
});
