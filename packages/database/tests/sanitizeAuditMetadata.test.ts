import { describe, expect, it } from "vitest";
import { sanitizeAuditMetadata } from "../src/repositories/PlatformAuditRepository";

describe("sanitizeAuditMetadata", () => {
  it("redacts sensitive keys and keeps safe fields", () => {
    const sanitized = sanitizeAuditMetadata({
      reason: "ok",
      password: "secret-value",
      refreshToken: "abc",
      api_key: "k",
      nested: { authorization: "Bearer x", count: 2 },
    }) as Record<string, unknown>;

    expect(sanitized.reason).toBe("ok");
    expect(sanitized.password).toBe("[redacted]");
    expect(sanitized.refreshToken).toBe("[redacted]");
    expect(sanitized.api_key).toBe("[redacted]");
    expect(sanitized.nested).toEqual({
      authorization: "[redacted]",
      count: 2,
    });
  });

  it("truncates deep nesting and long strings", () => {
    const deep = { a: { b: { c: { d: { e: { f: "too-deep" } } } } } };
    const sanitized = sanitizeAuditMetadata(deep) as Record<string, unknown>;
    const leaf = (
      (
        ((sanitized.a as Record<string, unknown>).b as Record<string, unknown>)
          .c as Record<string, unknown>
      ).d as Record<string, unknown>
    ).e;
    expect(leaf).toBe("[truncated]");

    const long = "x".repeat(600);
    expect(sanitizeAuditMetadata(long)).toBe(`${"x".repeat(500)}…`);
  });
});
