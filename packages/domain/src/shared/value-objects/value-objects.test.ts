import { describe, it, expect } from "vitest";
import { Email } from "./Email";
import { TenantSlug, PropertySlug } from "./Slug";
import { ValidationError } from "../errors/DomainError";

describe("Email", () => {
  it("creates valid email", () => {
    const email = Email.create("Test@Example.com");
    expect(email.value).toBe("test@example.com");
  });

  it("rejects invalid email", () => {
    expect(() => Email.create("invalid")).toThrow(ValidationError);
  });
});

describe("Slug", () => {
  it("creates slug from name", () => {
    const slug = TenantSlug.fromName("Villa Sunset");
    expect(slug.value).toBe("villa-sunset");
  });

  it("creates property slug", () => {
    const slug = PropertySlug.create("my-villa");
    expect(slug.value).toBe("my-villa");
  });

  it("rejects invalid slug", () => {
    expect(() => PropertySlug.create("ab")).toThrow(ValidationError);
  });
});
