import { describe, it, expect, vi, beforeEach } from "vitest";
import { ArchivePropertyUseCase } from "../src/catalog/application/ArchivePropertyUseCase";
import { Property } from "../src/catalog/domain/Property";
import { PermissionChecker } from "../src/shared/services/PermissionChecker";

describe("ArchivePropertyUseCase", () => {
  const permissionChecker = new PermissionChecker();
  const save = vi.fn();
  const findById = vi.fn();

  const useCase = new ArchivePropertyUseCase(
    { save, findById } as never,
    permissionChecker,
  );

  const actor = {
    userId: "user-1",
    role: "admin" as const,
    propertyIds: null,
    isSuperAdmin: false,
  };

  beforeEach(() => {
    save.mockReset();
    findById.mockReset();
  });

  it("archives property when admin has permission", async () => {
    const property = Property.create({
      id: "prop-1",
      tenantId: "tenant-1",
      name: "Villa",
      slug: "villa",
      defaultUnit: { id: "unit-1", maxGuests: 4 },
    });

    findById.mockResolvedValue(property);

    const result = await useCase.execute(
      { tenantId: "tenant-1", propertyId: "prop-1" },
      actor,
    );

    expect(result.isSuccess).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(result.getValue().status).toBe("archived");
  });

  it("denies manager without property scope", async () => {
    const property = Property.create({
      id: "prop-1",
      tenantId: "tenant-1",
      name: "Villa",
      slug: "villa",
      defaultUnit: { id: "unit-1", maxGuests: 4 },
    });

    findById.mockResolvedValue(property);

    const result = await useCase.execute(
      { tenantId: "tenant-1", propertyId: "prop-1" },
      {
        userId: "user-2",
        role: "manager",
        propertyIds: ["other-prop"],
        isSuperAdmin: false,
      },
    );

    expect(result.isFailure).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
});
