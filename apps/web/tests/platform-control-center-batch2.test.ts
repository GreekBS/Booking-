import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  PLATFORM_NAV_ITEMS,
  isPlatformNavActive,
  platformPageTitle,
} from "@/components/platform/nav";

describe("Platform Control Center Batch 2", () => {
  it("exposes Overview through Leads plus Batch 3 operational sections", () => {
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
    expect(
      PLATFORM_NAV_ITEMS.some((i) => i.href === "/platform/settings"),
    ).toBe(false);
  });

  it("titles Properties, Users, and Tenant detail pages", () => {
    expect(platformPageTitle("/platform/properties")).toBe("Properties");
    expect(platformPageTitle("/platform/users")).toBe("Users");
    expect(
      platformPageTitle("/platform/tenants/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    ).toBe("Tenant detail");
    expect(isPlatformNavActive("/platform/properties", "/platform/properties")).toBe(
      true,
    );
  });

  it("wires Super Admin layout and Batch 2 pages", () => {
    const layout = readFileSync(
      path.join(process.cwd(), "app/(platform)/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("requireSuperAdmin");

    const properties = readFileSync(
      path.join(process.cwd(), "app/(platform)/platform/properties/page.tsx"),
      "utf8",
    );
    expect(properties).toContain("listPlatformPropertiesUseCase");
    expect(properties).toContain("OpenTenantButton");
    expect(properties).not.toContain("Math.random");

    const users = readFileSync(
      path.join(process.cwd(), "app/(platform)/platform/users/page.tsx"),
      "utf8",
    );
    expect(users).toContain("listPlatformUsersUseCase");
    expect(users).toContain("PlatformRoleActions");
    expect(users).toContain("memberships");

    const detail = readFileSync(
      path.join(
        process.cwd(),
        "app/(platform)/platform/tenants/[tenantId]/page.tsx",
      ),
      "utf8",
    );
    expect(detail).toContain("getPlatformTenantDetailUseCase");
    expect(detail).toContain("OpenTenantButton");
    expect(detail).toContain('tab === "properties"');
    expect(detail).toContain('tab === "users"');
  });

  it("exposes promote/demote only through the protected platform-role route", () => {
    const route = readFileSync(
      path.join(
        process.cwd(),
        "app/api/platform/v1/users/[userId]/platform-role/route.ts",
      ),
      "utf8",
    );
    expect(route).toContain("requireSuperAdmin");
    expect(route).toContain("changePlatformSuperAdminRoleUseCase");
    expect(route).not.toContain("userRepository.save");
    expect(route).not.toContain("platformRole:");
  });

  it("reuses F.2 open-tenant for property workspace navigation", () => {
    const openTenant = readFileSync(
      path.join(process.cwd(), "features/tenants/open-tenant.ts"),
      "utf8",
    );
    expect(openTenant).toContain("destinationPath");
    expect(openTenant).toContain("DASHBOARD_PROPERTIES_PATH");
  });
});
