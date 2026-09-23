import { describe, it, expect, vi, beforeEach } from "vitest";
import { ListPropertyUnitCatalogUseCase } from "../src/catalog/application/PropertyQueryUseCases";
import type { IPropertyRepository } from "../src/catalog/ports/ICatalogRepositories";
import { PermissionChecker } from "../src/shared/services/PermissionChecker";
import { ForbiddenError } from "../src/shared/errors/DomainError";

describe("ListPropertyUnitCatalogUseCase", () => {
  const permissionChecker = new PermissionChecker();
  const listUnitCatalog = vi.fn();

  const propertyRepository = {
    listUnitCatalog,
  } as unknown as IPropertyRepository;

  const useCase = new ListPropertyUnitCatalogUseCase(
    propertyRepository,
    permissionChecker,
  );

  beforeEach(() => {
    listUnitCatalog.mockReset();
    listUnitCatalog.mockResolvedValue({
      properties: [
        {
          id: "prop-1",
          name: "Villa A",
          status: "active",
          units: [
            {
              id: "unit-1",
              propertyId: "prop-1",
              name: "Suite",
              status: "active",
            },
          ],
        },
      ],
    });
  });

  it("returns slim catalog for admin with property:read:tenant", async () => {
    const result = await useCase.execute("tenant-a", {
      userId: "admin-1",
      role: "admin",
      propertyIds: null,
      isSuperAdmin: false,
    });

    expect(result.isSuccess).toBe(true);
    const catalog = result.getValue();
    expect(catalog.properties).toHaveLength(1);
    expect(Object.keys(catalog.properties[0]!).sort()).toEqual(
      ["id", "name", "status", "units"].sort(),
    );
    expect(Object.keys(catalog.properties[0]!.units[0]!).sort()).toEqual(
      ["id", "propertyId", "name", "status"].sort(),
    );
    expect(listUnitCatalog).toHaveBeenCalledWith("tenant-a", null);
  });

  it("forbids actors without property:read:tenant", async () => {
    const result = await useCase.execute("tenant-a", {
      userId: "manager-1",
      role: "manager",
      propertyIds: ["prop-1"],
      isSuperAdmin: false,
    });

    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(ForbiddenError);
    expect(listUnitCatalog).not.toHaveBeenCalled();
  });

  it("does not include heavy amenity/detail fields in the slim shape", async () => {
    const result = await useCase.execute("tenant-a", {
      userId: "admin-1",
      role: "admin",
      propertyIds: null,
    });

    const json = JSON.stringify(result.getValue());
    expect(json).not.toMatch(/amenit/i);
    expect(json).not.toMatch(/location/i);
    expect(json).not.toMatch(/policy/i);
    expect(json).not.toMatch(/description/i);
  });

  it("super admin can list catalog tenant-wide", async () => {
    const result = await useCase.execute("tenant-a", {
      userId: "sa-1",
      role: "super_admin",
      propertyIds: null,
      isSuperAdmin: true,
    });

    expect(result.isSuccess).toBe(true);
    expect(listUnitCatalog).toHaveBeenCalledWith("tenant-a", null);
  });
});
