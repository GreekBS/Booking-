import { describe, it, expect } from "vitest";
import { assertValidTenantId } from "../src/client";

describe("setTenantContext security", () => {
  it("rejects invalid tenant id format", () => {
    expect(() => assertValidTenantId("not-a-uuid")).toThrow(
      "Invalid tenant ID format",
    );
  });

  it("accepts valid uuid", () => {
    expect(() =>
      assertValidTenantId("550e8400-e29b-41d4-a716-446655440000"),
    ).not.toThrow();
  });

  it("rejects sql injection attempt in tenant id", () => {
    expect(() =>
      assertValidTenantId("'; DROP TABLE tenants; --"),
    ).toThrow();
  });
});
