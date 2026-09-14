import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  RevokeMemberUseCase,
  UpdateMemberUseCase,
} from "../src/identity/application/MemberUseCases";
import { Membership } from "../src/identity/domain/Membership";
import { PermissionChecker } from "../src/shared/services/PermissionChecker";

describe("MemberUseCases", () => {
  const permissionChecker = new PermissionChecker();
  const append = vi.fn();
  const save = vi.fn();
  const findById = vi.fn();

  const adminActor = {
    userId: "admin-1",
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };

  beforeEach(() => {
    append.mockReset();
    save.mockReset();
    findById.mockReset();
  });

  it("revokes membership and writes audit log", async () => {
    const membership = Membership.create({
      id: "mem-1",
      userId: "user-2",
      tenantId: "tenant-1",
      role: "manager",
    });

    findById.mockResolvedValue(membership);

    const useCase = new RevokeMemberUseCase(
      { save, findById } as never,
      permissionChecker,
      { append } as never,
    );

    const result = await useCase.execute(
      { tenantId: "tenant-1", membershipId: "mem-1" },
      adminActor,
      { ipAddress: "127.0.0.1" },
    );

    expect(result.isSuccess).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "member.revoked" }),
    );
  });

  it("updates role and writes audit log", async () => {
    const membership = Membership.create({
      id: "mem-1",
      userId: "user-2",
      tenantId: "tenant-1",
      role: "manager",
    });

    findById.mockResolvedValue(membership);

    const useCase = new UpdateMemberUseCase(
      { save, findById } as never,
      permissionChecker,
      { append } as never,
    );

    const result = await useCase.execute(
      {
        tenantId: "tenant-1",
        membershipId: "mem-1",
        role: "admin",
      },
      adminActor,
      { ipAddress: null },
    );

    expect(result.isSuccess).toBe(true);
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "member.role_updated" }),
    );
  });
});
