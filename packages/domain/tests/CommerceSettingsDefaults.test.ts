import { describe, expect, it, vi } from "vitest";
import {
  GetCommerceSettingsUseCase,
  UpdateCommerceSettingsUseCase,
} from "../src/commerce/application/CommerceSettingsUseCases";
import { Result } from "../src/shared/kernel/Result";
import { PERMISSIONS } from "@hcp/permissions";

const tenantId = "tenant-commerce-1";
const actor = {
  userId: "user-1",
  platformRole: null as null,
  tenantId,
  role: "admin" as const,
  propertyIds: null as string[] | null,
};

describe("Commerce settings defaults", () => {
  it("Get backfills missing settings via ensureDefaults once", async () => {
    const ensured = {
      tenantId,
      defaultHoldTtlSeconds: 900,
      confirmationMode: "manual" as const,
      defaultCurrency: "EUR",
    };
    const repo = {
      findByTenantId: vi.fn().mockResolvedValue(null),
      ensureDefaults: vi.fn().mockResolvedValue(ensured),
    };
    const permissionChecker = {
      hasPermission: vi.fn().mockReturnValue(true),
    };

    const useCase = new GetCommerceSettingsUseCase(
      repo as never,
      permissionChecker as never,
    );
    const result = await useCase.execute(tenantId, actor);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual(ensured);
    expect(repo.ensureDefaults).toHaveBeenCalledOnce();
    expect(permissionChecker.hasPermission).toHaveBeenCalledWith(
      actor,
      PERMISSIONS.COMMERCE_READ,
      tenantId,
    );
  });

  it("Get does not call ensureDefaults when settings already exist", async () => {
    const existing = {
      tenantId,
      defaultHoldTtlSeconds: 600,
      confirmationMode: "payment_required" as const,
      defaultCurrency: "USD",
    };
    const repo = {
      findByTenantId: vi.fn().mockResolvedValue(existing),
      ensureDefaults: vi.fn(),
    };
    const permissionChecker = {
      hasPermission: vi.fn().mockReturnValue(true),
    };

    const useCase = new GetCommerceSettingsUseCase(
      repo as never,
      permissionChecker as never,
    );
    const result = await useCase.execute(tenantId, actor);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual(existing);
    expect(repo.ensureDefaults).not.toHaveBeenCalled();
  });

  it("Update ensureDefaults then updates without inventing overwrite of missing row", async () => {
    const ensured = {
      tenantId,
      defaultHoldTtlSeconds: 900,
      confirmationMode: "manual" as const,
      defaultCurrency: "EUR",
    };
    const updated = { ...ensured, defaultHoldTtlSeconds: 1200 };
    const repo = {
      findByTenantId: vi.fn().mockResolvedValue(null),
      ensureDefaults: vi.fn().mockResolvedValue(ensured),
      update: vi.fn().mockResolvedValue(updated),
    };
    const permissionChecker = {
      hasPermission: vi.fn().mockReturnValue(true),
    };
    const auditLog = { append: vi.fn().mockResolvedValue(undefined) };

    const useCase = new UpdateCommerceSettingsUseCase(
      repo as never,
      permissionChecker as never,
      auditLog as never,
    );
    const result = await useCase.execute(
      { tenantId, defaultHoldTtlSeconds: 1200 },
      actor,
      { actorId: "user-1", ipAddress: "127.0.0.1" },
    );

    expect(result.isSuccess).toBe(true);
    expect(repo.ensureDefaults).toHaveBeenCalledOnce();
    expect(repo.update).toHaveBeenCalledWith(tenantId, {
      defaultHoldTtlSeconds: 1200,
      confirmationMode: "manual",
      defaultCurrency: "EUR",
    });
  });
});
