import { describe, it, expect, vi, beforeEach } from "vitest";
import { GetPublicPropertyBySlugUseCase } from "../src/storefront/application/GetPublicPropertyBySlugUseCase";

describe("GetPublicPropertyBySlugUseCase", () => {
  const catalog = {
    getPublishedPropertyBySlug: vi.fn(),
    isPublishedUnit: vi.fn(),
  };

  const useCase = new GetPublicPropertyBySlugUseCase(catalog);

  beforeEach(() => {
    catalog.getPublishedPropertyBySlug.mockReset();
  });

  it("returns published property", async () => {
    catalog.getPublishedPropertyBySlug.mockResolvedValue({
      id: "prop-1",
      slug: "villa",
      name: "Villa",
      type: "villa",
      timezone: "Europe/Athens",
      city: "Athens",
      country: "GR",
      units: [],
    });

    const result = await useCase.execute("tenant-1", "villa");
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().slug).toBe("villa");
  });

  it("returns not found when property missing", async () => {
    catalog.getPublishedPropertyBySlug.mockResolvedValue(null);
    const result = await useCase.execute("tenant-1", "missing");
    expect(result.isFailure).toBe(true);
  });
});
