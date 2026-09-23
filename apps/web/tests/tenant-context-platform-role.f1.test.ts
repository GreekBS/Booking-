import { beforeEach, describe, expect, it, vi } from "vitest";
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

function jwtSession(overrides: {
  id?: string;
  email?: string;
  platformRole?: "super_admin" | null;
  activeTenantId?: string | null;
}) {
  return {
    user: {
      id: overrides.id ?? "550e8400-e29b-41d4-a716-4466554400f1",
      email: overrides.email ?? "u@example.com",
      platformRole: overrides.platformRole ?? null,
      activeTenantId: overrides.activeTenantId ?? null,
    },
  };
}

function dbUser(overrides: {
  id?: string;
  email?: string;
  platformRole?: "super_admin" | null;
}) {
  return User.create({
    id: overrides.id ?? "550e8400-e29b-41d4-a716-4466554400f1",
    email: overrides.email ?? "u@example.com",
    name: "Test",
    platformRole: overrides.platformRole ?? null,
  });
}

describe("requireSession / requireSuperAdmin (Phase F.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("missing session user id → UnauthorizedError", async () => {
    auth.mockResolvedValue({ user: {} });
    await expect(requireSession()).rejects.toBeInstanceOf(UnauthorizedError);
    expect(findById).not.toHaveBeenCalled();
  });

  it("fresh SA: JWT SA + DB SA → requireSuperAdmin succeeds", async () => {
    auth.mockResolvedValue(
      jwtSession({ platformRole: "super_admin" }),
    );
    findById.mockResolvedValue(dbUser({ platformRole: "super_admin" }));

    const actor = await requireSuperAdmin();
    expect(actor.platformRole).toBe("super_admin");
    expect(findById).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-4466554400f1",
    );
  });

  it("stale demoted SA: JWT SA + DB null → ForbiddenError", async () => {
    auth.mockResolvedValue(
      jwtSession({ platformRole: "super_admin" }),
    );
    findById.mockResolvedValue(dbUser({ platformRole: null }));

    await expect(requireSuperAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("newly promoted: JWT null + DB SA → requireSuperAdmin succeeds", async () => {
    auth.mockResolvedValue(jwtSession({ platformRole: null }));
    findById.mockResolvedValue(dbUser({ platformRole: "super_admin" }));

    const actor = await requireSuperAdmin();
    expect(actor.platformRole).toBe("super_admin");
  });

  it("missing DB user → UnauthorizedError", async () => {
    auth.mockResolvedValue(
      jwtSession({ platformRole: "super_admin" }),
    );
    findById.mockResolvedValue(null);

    await expect(requireSession()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("DB failure → must NOT authorize (fail closed, no JWT fallback)", async () => {
    auth.mockResolvedValue(
      jwtSession({ platformRole: "super_admin" }),
    );
    findById.mockRejectedValue(new Error("db down"));

    await expect(requireSuperAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("requireSession returns DB role, not JWT role", async () => {
    auth.mockResolvedValue(
      jwtSession({ platformRole: "super_admin" }),
    );
    findById.mockResolvedValue(dbUser({ platformRole: null }));

    const actor = await requireSession();
    expect(actor.platformRole).toBeNull();
  });
});

describe("requireTenantContext SA bypass (Phase F.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("stale JWT SA + resolver denial → NO SA bypass", async () => {
    auth.mockResolvedValue(
      jwtSession({
        platformRole: "super_admin",
        activeTenantId: "550e8400-e29b-41d4-a716-446655440020",
      }),
    );
    resolveTenantExecute.mockResolvedValue({
      isFailure: true,
      getError: () => new ForbiddenError("Not a member of this tenant"),
    });

    await expect(requireTenantContext()).rejects.toBeInstanceOf(ForbiddenError);

    expect(resolveTenantExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "550e8400-e29b-41d4-a716-4466554400f1",
        tenantId: "550e8400-e29b-41d4-a716-446655440020",
        jwtPlatformRole: "super_admin",
      }),
    );
    // User lookup happens inside ResolveTenantContextUseCase (mocked), not via requireSession.
    expect(findById).not.toHaveBeenCalled();
  });

  it("JWT null + DB SA via resolver → authoritative SA bypass works", async () => {
    auth.mockResolvedValue(
      jwtSession({
        platformRole: null,
        activeTenantId: "550e8400-e29b-41d4-a716-446655440020",
      }),
    );
    resolveTenantExecute.mockResolvedValue({
      isFailure: false,
      isSuccess: true,
      getValue: () => ({
        tenantId: "550e8400-e29b-41d4-a716-446655440020",
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
    expect(actor.platformRole).toBe("super_admin");
    expect(resolveTenantExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        jwtPlatformRole: null,
        userId: "550e8400-e29b-41d4-a716-4466554400f1",
      }),
    );
  });
});
