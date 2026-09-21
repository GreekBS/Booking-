import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PLATFORM_NAV_ITEMS,
  PLATFORM_NAV_SECTIONS,
  platformPageTitle,
} from "@/components/platform/nav";

describe("Platform Control Center Batch 4", () => {
  it("exposes final Platform navigation including Audit Log and Settings", () => {
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
    expect(PLATFORM_NAV_SECTIONS.map((s) => s.id)).toEqual([
      "overview",
      "directory",
      "operations",
      "governance",
    ]);
    expect(platformPageTitle("/platform/audit")).toBe("Audit Log");
    expect(platformPageTitle("/platform/settings")).toBe("Settings");
  });

  it("wires Audit Log as a truthful paginated read of audit_logs", () => {
    const audit = readFileSync(
      path.join(process.cwd(), "app/(platform)/platform/audit/page.tsx"),
      "utf8",
    );
    expect(audit).toContain("listPlatformAuditLogsUseCase");
    expect(audit).toContain('name="action"');
    expect(audit).toContain('name="actorId"');
    expect(audit).toContain('name="tenantId"');
    expect(audit).toContain('name="from"');
    expect(audit).toContain('name="to"');
    expect(audit).toContain("Coverage follows what use cases record");
    expect(audit).not.toContain("Math.random");
    expect(audit).not.toContain("Recent Activity");
    expect(audit).not.toContain("password");
  });

  it("wires Settings as read-only system configuration without fake toggles", () => {
    const settings = readFileSync(
      path.join(process.cwd(), "app/(platform)/platform/settings/page.tsx"),
      "utf8",
    );
    expect(settings).toContain("getPlatformSystemConfigurationUseCase");
    expect(settings).toContain("Read-only system configuration");
    expect(settings).toContain("No platform-level mutable settings");
    expect(settings).not.toContain("type=\"checkbox\"");
    expect(settings).not.toContain("DATABASE_URL");
    expect(settings).not.toContain("NEXTAUTH_SECRET");
    expect(settings).not.toContain("method: \"POST\"");
  });

  it("keeps platform layout Super Admin gated and sidebar sectioned", () => {
    const layout = readFileSync(
      path.join(process.cwd(), "app/(platform)/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("requireSuperAdmin");

    const sidebar = readFileSync(
      path.join(process.cwd(), "components/platform/PlatformSidebar.tsx"),
      "utf8",
    );
    expect(sidebar).toContain("PLATFORM_NAV_SECTIONS");
  });
});
