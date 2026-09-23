import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_PROPERTIES_PATH,
  openTenantAsPlatformAdmin,
} from "@/features/tenants/open-tenant";
import { shouldRedirectSuperAdminToPlatform } from "@/lib/dashboard-routing";
import {
  ForbiddenError,
  UnauthorizedError,
  User,
} from "@hcp/domain";

const auth = vi.fn();
const findById = vi.fn();
const resolveTenantExecute = vi.fn();

vi.mock("@/lib/auth/config", () => ({
  auth: (...args: unknown[]) => auth(...args),
}));

vi.mock("@/lib/di/container", () => ({
  userRepository: {
    findById: (...args: unknown[]) => findById(...args),
  },
  resolveTenantContextUseCase: {
    execute: (...args: unknown[]) => resolveTenantExecute(...args),
  },
}));

import {
  requireSession,
  requireSuperAdmin,
  requireTenantContext,
} from "@/lib/tenant-context";

const TENANT = "550e8400-e29b-41d4-a716-446655440020";
const USER = "550e8400-e29b-41d4-a716-4466554400f1";

function jwtSession(overrides: {
  platformRole?: "super_admin" | null;
  activeTenantId?: string | null;
}) {
  return {
    user: {
      id: USER,
      email: "admin@gmail.com",
      platformRole: overrides.platformRole ?? null,
      activeTenantId: overrides.activeTenantId ?? null,
    },
  };
}

function dbUser(platformRole: "super_admin" | null) {
  return User.create({
    id: USER,
    email: "admin@gmail.com",
    name: "Admin",
    platformRole,
  });
}

describe("Phase F.2 — openTenantAsPlatformAdmin", () => {
  it("impersonate → update({ activeTenantId }) → then navigate", async () => {
    const order: string[] = [];
    const updateSession = vi.fn(async () => {
      order.push("update");
    });
    const navigate = vi.fn((url: string) => {
      order.push(`navigate:${url}`);
    });

    const result = await openTenantAsPlatformAdmin({
      tenantId: TENANT,
      impersonate: async () => {
        order.push("impersonate");
        return new Response(JSON.stringify({ data: { impersonating: true } }), {
          status: 200,
        });
      },
      updateSession,
      navigate,
    });

    expect(result).toEqual({ ok: true });
    expect(updateSession).toHaveBeenCalledWith({ activeTenantId: TENANT });
    expect(navigate).toHaveBeenCalledWith(DASHBOARD_PROPERTIES_PATH);
    expect(order).toEqual([
      "impersonate",
      "update",
      `navigate:${DASHBOARD_PROPERTIES_PATH}`,
    ]);
  });

  it("does NOT navigate when Auth.js update fails after successful impersonate", async () => {
    const navigate = vi.fn();
    const result = await openTenantAsPlatformAdmin({
      tenantId: TENANT,
      impersonate: async () =>
        new Response(JSON.stringify({ data: { impersonating: true } }), {
          status: 200,
        }),
      updateSession: async () => {
        throw new Error("session update failed");
      },
      navigate,
    });

    expect(result).toEqual({
      ok: false,
      error: "session update failed",
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does NOT update session or navigate when impersonate fails", async () => {
    const updateSession = vi.fn();
    const navigate = vi.fn();
    const result = await openTenantAsPlatformAdmin({
      tenantId: TENANT,
      impersonate: async () =>
        new Response(
          JSON.stringify({
            error: { message: "Super admin access required" },
          }),
          { status: 403 },
        ),
      updateSession,
      navigate,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Super admin access required");
    }
    expect(updateSession).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("Phase F.2 — dashboard Super Admin routing (UX)", () => {
  it("SA + no activeTenantId → redirect to platform tenants", () => {
    expect(
      shouldRedirectSuperAdminToPlatform({
        platformRole: "super_admin",
        activeTenantId: null,
      }),
    ).toBe(true);
  });

  it("SA + activeTenantId → allow dashboard", () => {
    expect(
      shouldRedirectSuperAdminToPlatform({
        platformRole: "super_admin",
        activeTenantId: TENANT,
      }),
    ).toBe(false);
  });

  it("normal tenant user (null platformRole) → never redirect via SA rule", () => {
    expect(
      shouldRedirectSuperAdminToPlatform({
        platformRole: null,
        activeTenantId: TENANT,
      }),
    ).toBe(false);
    expect(
      shouldRedirectSuperAdminToPlatform({
        platformRole: null,
        activeTenantId: null,
      }),
    ).toBe(false);
  });
});

describe("Phase F.2 — tenant context after Open + stale-SA closed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("DB SA + JWT activeTenantId → requireTenantContext SA bypass", async () => {
    auth.mockResolvedValue(
      jwtSession({
        platformRole: "super_admin",
        activeTenantId: TENANT,
      }),
    );
    resolveTenantExecute.mockResolvedValue({
      isFailure: false,
      isSuccess: true,
      getValue: () => ({
        tenantId: TENANT,
        tenantStatus: "active",
        role: "super_admin",
        propertyIds: null,
        isSuperAdmin: true,
        platformRole: "super_admin",
        email: "u@example.com",
        userId: "550e8400-e29b-41d4-a716-4466554400f1",
      }),
    });

    const actor = await requireTenantContext();
    expect(actor.isSuperAdmin).toBe(true);
    expect(actor.activeTenantId).toBe(TENANT);
    expect(resolveTenantExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        jwtPlatformRole: "super_admin",
        tenantId: TENANT,
      }),
    );
  });

  it("stale JWT SA + activeTenantId + DB null + no membership → DENY", async () => {
    auth.mockResolvedValue(
      jwtSession({
        platformRole: "super_admin",
        activeTenantId: TENANT,
      }),
    );
    resolveTenantExecute.mockResolvedValue({
      isFailure: true,
      getError: () => new ForbiddenError("Not a member of this tenant"),
    });

    await expect(requireTenantContext()).rejects.toBeInstanceOf(ForbiddenError);
    expect(resolveTenantExecute).toHaveBeenCalledWith(
      expect.objectContaining({ jwtPlatformRole: "super_admin", tenantId: TENANT }),
    );
  });

  it("stale JWT SA + DB null → requireSuperAdmin DENY", async () => {
    auth.mockResolvedValue(jwtSession({ platformRole: "super_admin" }));
    findById.mockResolvedValue(dbUser(null));
    await expect(requireSuperAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("owner-style tenant user: DB null role + activeTenantId preserved", async () => {
    auth.mockResolvedValue(
      jwtSession({ platformRole: null, activeTenantId: TENANT }),
    );
    findById.mockResolvedValue(dbUser(null));
    resolveTenantExecute.mockResolvedValue({
      isFailure: false,
      isSuccess: true,
      getValue: () => ({
        tenantId: TENANT,
        tenantStatus: "active",
        role: "owner",
        propertyIds: null,
        isSuperAdmin: false,
        platformRole: null,
        email: "u@example.com",
        userId: "550e8400-e29b-41d4-a716-4466554400f1",
      }),
    });

    const sessionActor = await requireSession();
    expect(sessionActor.platformRole).toBeNull();
    expect(sessionActor.activeTenantId).toBe(TENANT);

    const tenantActor = await requireTenantContext();
    expect(tenantActor.role).toBe("owner");
    expect(tenantActor.isSuperAdmin).toBe(false);
  });

  it("no membership → DENY for non-SA", async () => {
    auth.mockResolvedValue(
      jwtSession({ platformRole: null, activeTenantId: TENANT }),
    );
    findById.mockResolvedValue(dbUser(null));
    resolveTenantExecute.mockResolvedValue({
      isFailure: true,
      getError: () => new ForbiddenError("Not a member of this tenant"),
    });

    await expect(requireTenantContext()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("missing session → UnauthorizedError", async () => {
    auth.mockResolvedValue(null);
    await expect(requireSession()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
