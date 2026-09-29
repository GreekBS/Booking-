import { describe, expect, it, vi } from "vitest";
import { CreateOrganizationForUserUseCase } from "../src/platform/application/CreateOrganizationForUserUseCase";
import { Result } from "../src/shared/kernel/Result";
import { ConflictError } from "../src/shared/errors/DomainError";
import { Membership } from "../src/identity/domain/Membership";
import { Tenant } from "../src/platform/domain/Tenant";
import { TenantSettings } from "../src/shared/value-objects/Policies";

describe("CreateOrganizationForUserUseCase", () => {
  const audit = { actorId: "user-1", ipAddress: "127.0.0.1" };

  it("reuses existing active membership without creating another tenant", async () => {
    const existingTenant = Tenant.create({
      id: "tenant-existing",
      name: "Existing Org",
      slug: "existing-org",
      settings: TenantSettings.create({}),
    });
    const membership = Membership.create({
      id: "mem-1",
      userId: "user-1",
      tenantId: existingTenant.id,
      role: "admin",
      propertyIds: null,
    });

    const createTenant = { execute: vi.fn() };
    const userRepository = {
      findById: vi.fn().mockResolvedValue({
        id: "user-1",
        toProps: () => ({ email: "owner@example.com", name: "Owner" }),
      }),
    };
    const membershipRepository = {
      findByUser: vi.fn().mockResolvedValue([membership]),
    };
    const tenantRepository = {
      findById: vi.fn().mockResolvedValue(existingTenant),
    };

    const useCase = new CreateOrganizationForUserUseCase(
      createTenant as never,
      userRepository as never,
      membershipRepository as never,
      tenantRepository as never,
      { generate: () => "id-new" },
    );

    const result = await useCase.execute(
      { userId: "user-1", name: "Should Not Create" },
      audit,
    );

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.reusedExisting).toBe(true);
    expect(value.tenant.id).toBe("tenant-existing");
    expect(createTenant.execute).not.toHaveBeenCalled();
  });

  it("creates tenant + admin membership for users without membership", async () => {
    const createdTenant = Tenant.create({
      id: "tenant-new",
      name: "New Org",
      slug: "new-org",
      settings: TenantSettings.create({}),
    });
    const membership = Membership.create({
      id: "mem-new",
      userId: "user-2",
      tenantId: createdTenant.id,
      role: "admin",
      propertyIds: null,
    });

    const createTenant = {
      execute: vi.fn().mockResolvedValue(
        Result.ok({
          tenant: createdTenant,
          provisioning: { type: "membership", membershipId: membership.id },
        }),
      ),
    };
    const userRepository = {
      findById: vi.fn().mockResolvedValue({
        id: "user-2",
        toProps: () => ({ email: "new@example.com", name: "New Owner" }),
      }),
    };
    const membershipRepository = {
      findByUser: vi.fn().mockResolvedValue([]),
    };
    const tenantRepository = { findById: vi.fn() };

    const useCase = new CreateOrganizationForUserUseCase(
      createTenant as never,
      userRepository as never,
      membershipRepository as never,
      tenantRepository as never,
      { generate: () => "id-new" },
    );

    const result = await useCase.execute(
      {
        userId: "user-2",
        name: "New Org",
        timezone: "Europe/Athens",
        defaultLocale: "el",
        defaultCurrency: "EUR",
      },
      audit,
    );

    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.reusedExisting).toBe(false);
    expect(value.tenant.id).toBe("tenant-new");
    expect(createTenant.execute).toHaveBeenCalledOnce();
    const command = createTenant.execute.mock.calls[0][0];
    expect(command.adminEmail).toBe("new@example.com");
    expect(command.invitedByUserId).toBe("user-2");
  });

  it("claims empty slug-conflict tenant and ensures commerce defaults", async () => {
    const orphan = Tenant.create({
      id: "tenant-orphan",
      name: "Orphan Org",
      slug: "orphan-org",
      settings: TenantSettings.create({}),
    });

    const createTenant = {
      execute: vi.fn().mockResolvedValue(Result.fail(new ConflictError("slug"))),
    };
    const membershipRepository = {
      findByUser: vi.fn().mockResolvedValue([]),
      findByTenant: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const tenantRepository = {
      findBySlug: vi.fn().mockResolvedValue(orphan),
    };
    const commerceSettingsRepository = {
      ensureDefaults: vi.fn().mockResolvedValue({
        tenantId: orphan.id,
        defaultHoldTtlSeconds: 900,
        confirmationMode: "manual",
        defaultCurrency: "EUR",
      }),
    };

    const useCase = new CreateOrganizationForUserUseCase(
      createTenant as never,
      {
        findById: vi.fn().mockResolvedValue({
          id: "user-3",
          toProps: () => ({ email: "claim@example.com", name: "Claimer" }),
        }),
      } as never,
      membershipRepository as never,
      tenantRepository as never,
      { generate: () => "mem-claim" },
      commerceSettingsRepository as never,
    );

    const result = await useCase.execute(
      { userId: "user-3", name: "Orphan Org", slug: "orphan-org" },
      audit,
    );

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().reusedExisting).toBe(true);
    expect(membershipRepository.save).toHaveBeenCalledOnce();
    expect(commerceSettingsRepository.ensureDefaults).toHaveBeenCalledWith(orphan.id);
  });
});
