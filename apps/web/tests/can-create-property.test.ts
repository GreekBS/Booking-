import { describe, expect, it } from "vitest";
import { canCreateProperty } from "@/lib/admin/can-create-property";
import type { MeProfile } from "@/lib/admin/types";

function profile(input: {
  platformRole?: string | null;
  role?: string;
  tenantId?: string;
}): MeProfile {
  const tenantId = input.tenantId ?? "t1";
  return {
    user: {
      id: "u1",
      email: "a@example.com",
      name: "A",
      platformRole: input.platformRole ?? null,
      emailVerified: null,
    },
    memberships: [
      {
        id: "m1",
        tenantId,
        tenantName: "Tenant",
        tenantSlug: "tenant",
        role: input.role ?? "admin",
        propertyIds: null,
        status: "active",
      },
    ],
    activeTenantId: tenantId,
  };
}

describe("canCreateProperty", () => {
  it("allows tenant admin", () => {
    expect(canCreateProperty(profile({ role: "admin" }), "t1")).toBe(true);
  });

  it("denies manager", () => {
    expect(canCreateProperty(profile({ role: "manager" }), "t1")).toBe(false);
  });

  it("allows super_admin without matching membership role", () => {
    expect(
      canCreateProperty(
        profile({ platformRole: "super_admin", role: "manager" }),
        "t1",
      ),
    ).toBe(true);
  });

  it("denies null profile / tenant", () => {
    expect(canCreateProperty(null, "t1")).toBe(false);
    expect(canCreateProperty(profile({ role: "admin" }), null)).toBe(false);
  });
});
