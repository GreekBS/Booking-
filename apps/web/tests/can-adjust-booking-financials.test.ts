import { describe, expect, it } from "vitest";
import { canAdjustBookingFinancials } from "@/lib/admin/can-adjust-booking-financials";
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

describe("canAdjustBookingFinancials", () => {
  it("allows tenant admin", () => {
    expect(canAdjustBookingFinancials(profile({ role: "admin" }), "t1")).toBe(
      true,
    );
  });

  it("denies manager", () => {
    expect(canAdjustBookingFinancials(profile({ role: "manager" }), "t1")).toBe(
      false,
    );
  });

  it("allows super_admin even with manager membership when tenant is active", () => {
    expect(
      canAdjustBookingFinancials(
        profile({ platformRole: "super_admin", role: "manager" }),
        "t1",
      ),
    ).toBe(true);
  });

  it("denies super_admin without active tenant context", () => {
    expect(
      canAdjustBookingFinancials(
        profile({ platformRole: "super_admin", role: "admin" }),
        null,
      ),
    ).toBe(false);
  });

  it("denies null profile / tenant", () => {
    expect(canAdjustBookingFinancials(null, "t1")).toBe(false);
    expect(canAdjustBookingFinancials(profile({ role: "admin" }), null)).toBe(
      false,
    );
  });
});
