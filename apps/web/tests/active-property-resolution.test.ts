import { describe, it, expect } from "vitest";
import { resolveActivePropertyId } from "@/lib/admin/active-property";

describe("resolveActivePropertyId", () => {
  it("returns null when no accessible properties", () => {
    expect(resolveActivePropertyId([], "any", "any")).toBeNull();
  });

  it("auto-selects the only accessible property", () => {
    expect(resolveActivePropertyId(["p1"], null, null)).toBe("p1");
  });

  it("prefers current valid selection", () => {
    expect(resolveActivePropertyId(["p1", "p2"], "p1", "p2")).toBe("p2");
  });

  it("falls back to stored when current is invalid", () => {
    expect(resolveActivePropertyId(["p1", "p2"], "p2", "gone")).toBe("p2");
  });

  it("ignores stored id from another tenant / inaccessible set", () => {
    expect(resolveActivePropertyId(["p1", "p2"], "other-tenant-prop", null)).toBe(
      "p1",
    );
  });

  it("falls back to first when stored is stale/deleted", () => {
    expect(resolveActivePropertyId(["p2", "p3"], "p1-deleted", null)).toBe("p2");
  });

  it("selects among multiple properties using stored valid id", () => {
    expect(resolveActivePropertyId(["a", "b", "c"], "b", null)).toBe("b");
  });
});
