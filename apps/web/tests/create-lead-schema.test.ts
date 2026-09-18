import { describe, expect, it } from "vitest";
import { createLeadSchema } from "@hcp/validators";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    submissionId: "11111111-1111-4111-8111-111111111111",
    fullName: "Ada Owner",
    email: "Ada@Example.COM",
    country: "Greece",
    relationship: "owner",
    portfolioSize: "two_to_five",
    accommodationTypes: ["villa"],
    propertyCountry: "Greece",
    operatingState: "operating",
    interests: ["run"],
    source: "homepage_hero",
    ...overrides,
  };
}

describe("createLeadSchema", () => {
  it("normalizes email and accepts optional revenue omission", () => {
    const parsed = createLeadSchema.parse(validPayload());
    expect(parsed.email).toBe("ada@example.com");
    expect(parsed.revenueRange).toBeUndefined();
  });

  it("rejects unknown/internal fields (strict)", () => {
    expect(() =>
      createLeadSchema.parse(
        validPayload({
          status: "won",
          platformRole: "super_admin",
          notes: "hack",
          tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        }),
      ),
    ).toThrow();
  });

  it("rejects empty interests and accommodation types", () => {
    expect(() => createLeadSchema.parse(validPayload({ interests: [] }))).toThrow();
    expect(() =>
      createLeadSchema.parse(validPayload({ accommodationTypes: [] })),
    ).toThrow();
  });

  it("rejects invalid enums and oversized strings", () => {
    expect(() =>
      createLeadSchema.parse(validPayload({ relationship: "ceo" })),
    ).toThrow();
    expect(() =>
      createLeadSchema.parse(validPayload({ fullName: "a".repeat(121) })),
    ).toThrow();
    expect(() =>
      createLeadSchema.parse(validPayload({ message: "m".repeat(1001) })),
    ).toThrow();
  });

  it("requires submissionId uuid", () => {
    expect(() =>
      createLeadSchema.parse(validPayload({ submissionId: "not-a-uuid" })),
    ).toThrow();
  });
});
