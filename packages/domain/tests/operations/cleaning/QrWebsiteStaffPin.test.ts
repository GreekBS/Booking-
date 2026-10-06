import { describe, expect, it } from "vitest";
import {
  normalizePropertyWebsiteUrl,
  assertSafeWebsiteRedirectUrl,
} from "../../../src/catalog/domain/propertyWebsiteUrl";
import {
  HmacHkStaffCapabilitySigner,
  HK_STAFF_CAPABILITY_TTL_SECONDS,
} from "../../../src/operations/cleaning/domain/HkStaffCapability";
import { ValidationError } from "../../../src/shared/errors/DomainError";

describe("normalizePropertyWebsiteUrl", () => {
  it("accepts https and http", () => {
    expect(normalizePropertyWebsiteUrl("https://villa.example/")).toBe(
      "https://villa.example/",
    );
    expect(normalizePropertyWebsiteUrl("http://villa.example/path")).toBe(
      "http://villa.example/path",
    );
  });

  it("clears empty", () => {
    expect(normalizePropertyWebsiteUrl("")).toBeNull();
    expect(normalizePropertyWebsiteUrl(null)).toBeNull();
  });

  it("rejects javascript and data", () => {
    expect(() => normalizePropertyWebsiteUrl("javascript:alert(1)")).toThrow(
      ValidationError,
    );
    expect(() => normalizePropertyWebsiteUrl("data:text/html,hi")).toThrow(
      ValidationError,
    );
  });

  it("rejects credentials and malformed", () => {
    expect(() =>
      normalizePropertyWebsiteUrl("https://user:pass@evil.example/"),
    ).toThrow(ValidationError);
    expect(() => normalizePropertyWebsiteUrl("not a url")).toThrow(ValidationError);
  });

  it("assertSafeWebsiteRedirectUrl revalidates", () => {
    expect(assertSafeWebsiteRedirectUrl("https://ok.example")).toBe(
      "https://ok.example/",
    );
  });

  it("rejects file and protocol-relative schemes", () => {
    expect(() => normalizePropertyWebsiteUrl("file:///etc/passwd")).toThrow(
      ValidationError,
    );
    expect(() => normalizePropertyWebsiteUrl("//evil.example")).toThrow(
      ValidationError,
    );
  });
});

describe("HmacHkStaffCapabilitySigner", () => {
  const signer = new HmacHkStaffCapabilitySigner("test-secret-at-least-16");

  it("issues and verifies scoped claims", () => {
    const { token, claims } = signer.issue({
      tenantId: "11111111-1111-1111-1111-111111111111",
      propertyId: "22222222-2222-2222-2222-222222222222",
      locationId: "33333333-3333-3333-3333-333333333333",
      unitId: "44444444-4444-4444-4444-444444444444",
      qrAccessId: "55555555-5555-5555-5555-555555555555",
      tokenHash: "a".repeat(64),
    });
    expect(claims.typ).toBe("hk_staff");
    expect(claims.exp - claims.iat).toBe(HK_STAFF_CAPABILITY_TTL_SECONDS);
    const verified = signer.verify(token);
    expect(verified?.locationId).toBe(claims.locationId);
    expect(verified?.unitId).toBe(claims.unitId);
  });

  it("rejects expired and tampered tokens", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const { token } = signer.issue({
      tenantId: "11111111-1111-1111-1111-111111111111",
      propertyId: "22222222-2222-2222-2222-222222222222",
      locationId: "33333333-3333-3333-3333-333333333333",
      unitId: null,
      qrAccessId: "55555555-5555-5555-5555-555555555555",
      tokenHash: "b".repeat(64),
      now,
      ttlSeconds: 60,
    });
    expect(signer.verify(token, new Date("2026-01-01T00:00:30Z"))).not.toBeNull();
    expect(signer.verify(token, new Date("2026-01-01T00:02:00Z"))).toBeNull();
    expect(signer.verify(token + "x", now)).toBeNull();
  });
});
