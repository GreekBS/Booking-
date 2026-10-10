import { describe, expect, it, vi } from "vitest";
import {
  resolveUnitContext,
  resolveUnitContextForOperatorRead,
} from "../src/commerce/application/commerceAccess";

describe("commerceAccess unit context", () => {
  const catalog = {
    getUnit: vi.fn(),
    getProperty: vi.fn(),
  };

  it("blocks booking paths when property is draft", async () => {
    catalog.getUnit.mockResolvedValue({
      id: "unit-1",
      propertyId: "prop-1",
      status: "active",
    });
    catalog.getProperty.mockResolvedValue({
      id: "prop-1",
      status: "draft",
    });

    const result = await resolveUnitContext(catalog as never, "unit-1", "tenant-1");
    expect(result.isFailure).toBe(true);
    expect(result.getError().message).toContain("not available for booking");
  });

  it("allows operator read/configure when property is draft", async () => {
    catalog.getUnit.mockResolvedValue({
      id: "unit-1",
      propertyId: "prop-1",
      status: "active",
    });
    catalog.getProperty.mockResolvedValue({
      id: "prop-1",
      status: "draft",
    });

    const result = await resolveUnitContextForOperatorRead(
      catalog as never,
      "unit-1",
      "tenant-1",
    );
    expect(result.isSuccess).toBe(true);
  });

  it("blocks booking/hold paths when unit is inactive (C3-H1)", async () => {
    catalog.getUnit.mockResolvedValue({
      id: "unit-inactive",
      propertyId: "prop-1",
      status: "inactive",
    });
    catalog.getProperty.mockResolvedValue({
      id: "prop-1",
      status: "active",
    });

    const write = await resolveUnitContext(
      catalog as never,
      "unit-inactive",
      "tenant-1",
    );
    expect(write.isFailure).toBe(true);
    expect(write.getError().message).toContain("not available for booking");

    const read = await resolveUnitContextForOperatorRead(
      catalog as never,
      "unit-inactive",
      "tenant-1",
    );
    expect(read.isSuccess).toBe(true);
  });
});
