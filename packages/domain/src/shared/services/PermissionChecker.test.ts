import { describe, it, expect } from "vitest";
import { PermissionChecker } from "./PermissionChecker";

describe("PermissionChecker", () => {
  const checker = new PermissionChecker();

  it("allows admin to create property", () => {
    expect(
      checker.hasPermission(
        { userId: "1", role: "admin", propertyIds: null },
        "property:create:tenant",
        "tenant-1",
      ),
    ).toBe(true);
  });

  it("denies manager from inviting members", () => {
    expect(
      checker.hasPermission(
        { userId: "2", role: "manager", propertyIds: ["prop-1"] },
        "member:invite:tenant",
        "tenant-1",
      ),
    ).toBe(false);
  });

  it("allows manager scoped property access", () => {
    expect(
      checker.canAccessProperty(
        { userId: "2", role: "manager", propertyIds: ["prop-1"] },
        "tenant-1",
        "prop-1",
        "property:read",
      ),
    ).toBe(true);

    expect(
      checker.canAccessProperty(
        { userId: "2", role: "manager", propertyIds: ["prop-1"] },
        "tenant-1",
        "prop-2",
        "property:read",
      ),
    ).toBe(false);
  });

  it("allows super admin all access", () => {
    expect(
      checker.canAccessProperty(
        { userId: "0", role: "super_admin", propertyIds: null, isSuperAdmin: true },
        "tenant-1",
        "any",
        "property:update",
      ),
    ).toBe(true);
  });
});
