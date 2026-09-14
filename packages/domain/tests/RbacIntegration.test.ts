import { describe, it, expect } from "vitest";
import { PermissionChecker } from "../src/shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";

describe("RBAC integration", () => {
  const checker = new PermissionChecker();

  it("grants admin tenant-scoped property delete", () => {
    expect(
      checker.hasPermission(
        { userId: "1", role: "admin", propertyIds: null },
        PERMISSIONS.PROPERTY_DELETE_TENANT,
        "tenant-1",
      ),
    ).toBe(true);
  });

  it("denies manager tenant-wide delete", () => {
    expect(
      checker.hasPermission(
        { userId: "1", role: "manager", propertyIds: ["p1"], isSuperAdmin: false },
        PERMISSIONS.PROPERTY_DELETE_TENANT,
        "tenant-1",
      ),
    ).toBe(false);
  });

  it("allows super admin platform tenant update", () => {
    expect(
      checker.hasPermission(
        {
          userId: "1",
          role: "super_admin",
          propertyIds: null,
          isSuperAdmin: true,
        },
        PERMISSIONS.PLATFORM_TENANT_UPDATE,
        "tenant-1",
      ),
    ).toBe(true);
  });

  it("grants admin commerce booking create", () => {
    expect(
      checker.hasPermission(
        { userId: "1", role: "admin", propertyIds: null },
        PERMISSIONS.BOOKING_CREATE_TENANT,
        "tenant-1",
      ),
    ).toBe(true);
  });

  it("denies manager hold create", () => {
    expect(
      checker.hasPermission(
        { userId: "1", role: "manager", propertyIds: ["p1"], isSuperAdmin: false },
        PERMISSIONS.HOLD_CREATE_TENANT,
        "tenant-1",
      ),
    ).toBe(false);
  });
});
