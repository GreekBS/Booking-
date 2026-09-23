import { beforeEach, describe, expect, it, vi } from "vitest";
import { ResolveTenantContextUseCase } from "../src/identity/application/ResolveTenantContextUseCase";
import {
  ForbiddenError,
  UnauthorizedError,
  User,
  Membership,
} from "../src";

const USER_ID = "550e8400-e29b-41d4-a716-4466554400f1";
const TENANT_ID = "550e8400-e29b-41d4-a716-446655440020";

function dbUser(platformRole: "super_admin" | null = null) {
  return User.create({
    id: USER_ID,
    email: "u@example.com",
    name: "Test",
    platformRole,
  });
}

function activeTenant(status: "active" | "suspended" = "active") {
  return {
    id: TENANT_ID,
    status,
    toProps: () => ({ id: TENANT_ID, status }),
  };
}

describe("ResolveTenantContextUseCase — parallel User ∥ Tenant", () => {
  const findUserById = vi.fn();
  const findTenantById = vi.fn();
  const findByUserAndTenant = vi.fn();

  const useCase = new ResolveTenantContextUseCase(
    { findById: findUserById } as never,
    { findById: findTenantById } as never,
    { findByUserAndTenant } as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("fetches User and Tenant via Promise.all (both invoked before either awaits)", async () => {
    const order: string[] = [];
    findUserById.mockImplementation(async () => {
      order.push("user-start");
      await Promise.resolve();
      order.push("user-end");
      return dbUser(null);
    });
    findTenantById.mockImplementation(async () => {
      order.push("tenant-start");
      await Promise.resolve();
      order.push("tenant-end");
      return activeTenant();
    });
    findByUserAndTenant.mockResolvedValue(
      Membership.create({
        id: "mem-1",
        userId: USER_ID,
        tenantId: TENANT_ID,
        role: "admin",
        propertyIds: null,
        status: "active",
      }),
    );

    const result = await useCase.execute({ userId: USER_ID, tenantId: TENANT_ID });
    expect(result.isSuccess).toBe(true);
    // Both starts happen before either end (true parallel kickoff).
    expect(order.indexOf("user-start")).toBeLessThan(order.indexOf("user-end"));
    expect(order.indexOf("tenant-start")).toBeLessThan(order.indexOf("tenant-end"));
    expect(order.indexOf("user-start")).toBeLessThan(order.indexOf("tenant-end"));
    expect(order.indexOf("tenant-start")).toBeLessThan(order.indexOf("user-end"));
    expect(findByUserAndTenant).toHaveBeenCalledTimes(1);
  });

  it("missing user → UnauthorizedError", async () => {
    findUserById.mockResolvedValue(null);
    findTenantById.mockResolvedValue(activeTenant());
    const result = await useCase.execute({ userId: USER_ID, tenantId: TENANT_ID });
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(UnauthorizedError);
    expect(findByUserAndTenant).not.toHaveBeenCalled();
  });

  it("missing tenant → ForbiddenError", async () => {
    findUserById.mockResolvedValue(dbUser(null));
    findTenantById.mockResolvedValue(null);
    const result = await useCase.execute({ userId: USER_ID, tenantId: TENANT_ID });
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
    expect(result.getError().message).toBe("Tenant not found");
  });

  it("suspended tenant → ForbiddenError", async () => {
    findUserById.mockResolvedValue(dbUser("super_admin"));
    findTenantById.mockResolvedValue(activeTenant("suspended"));
    const result = await useCase.execute({ userId: USER_ID, tenantId: TENANT_ID });
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toBe("Tenant suspended");
    expect(findByUserAndTenant).not.toHaveBeenCalled();
  });

  it("DB SA bypasses membership (JWT claim ignored for privilege)", async () => {
    findUserById.mockResolvedValue(dbUser("super_admin"));
    findTenantById.mockResolvedValue(activeTenant());
    const result = await useCase.execute({
      userId: USER_ID,
      tenantId: TENANT_ID,
      jwtPlatformRole: null,
    });
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().isSuperAdmin).toBe(true);
    expect(result.getValue().platformRole).toBe("super_admin");
    expect(findByUserAndTenant).not.toHaveBeenCalled();
  });

  it("JWT SA + DB null → no SA bypass; membership required", async () => {
    findUserById.mockResolvedValue(dbUser(null));
    findTenantById.mockResolvedValue(activeTenant());
    findByUserAndTenant.mockResolvedValue(null);
    const result = await useCase.execute({
      userId: USER_ID,
      tenantId: TENANT_ID,
      jwtPlatformRole: "super_admin",
    });
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toBe("Not a member of this tenant");
    expect(findByUserAndTenant).toHaveBeenCalledTimes(1);
  });

  it("active membership succeeds with DB role", async () => {
    findUserById.mockResolvedValue(dbUser(null));
    findTenantById.mockResolvedValue(activeTenant());
    findByUserAndTenant.mockResolvedValue(
      Membership.create({
        id: "mem-1",
        userId: USER_ID,
        tenantId: TENANT_ID,
        role: "manager",
        propertyIds: ["prop-1"],
        status: "active",
      }),
    );
    const result = await useCase.execute({ userId: USER_ID, tenantId: TENANT_ID });
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().role).toBe("manager");
    expect(result.getValue().propertyIds).toEqual(["prop-1"]);
    expect(result.getValue().isSuperAdmin).toBe(false);
  });

  it("revoked membership denied", async () => {
    findUserById.mockResolvedValue(dbUser(null));
    findTenantById.mockResolvedValue(activeTenant());
    findByUserAndTenant.mockResolvedValue(
      Membership.create({
        id: "mem-1",
        userId: USER_ID,
        tenantId: TENANT_ID,
        role: "admin",
        propertyIds: null,
        status: "revoked",
      }),
    );
    const result = await useCase.execute({ userId: USER_ID, tenantId: TENANT_ID });
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toBe("Not a member of this tenant");
  });
});
