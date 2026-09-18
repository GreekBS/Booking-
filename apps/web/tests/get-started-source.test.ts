import { describe, expect, it } from "vitest";
import {
  parseLeadSourceParam,
  parseOptionalUtm,
} from "@/lib/marketing/lead-source";

describe("parseLeadSourceParam", () => {
  it("accepts allowlisted snake_case sources", () => {
    expect(parseLeadSourceParam("homepage_hero")).toBe("homepage_hero");
    expect(parseLeadSourceParam("property_management")).toBe(
      "property_management",
    );
    expect(parseLeadSourceParam("pms")).toBe("pms");
  });

  it("normalizes SCREAMING_SNAKE and hyphens", () => {
    expect(parseLeadSourceParam("HOMEPAGE_NAV")).toBe("homepage_nav");
    expect(parseLeadSourceParam("direct-bookings")).toBe("direct_bookings");
  });

  it("falls back to other for arbitrary values", () => {
    expect(parseLeadSourceParam("evil_injection")).toBe("other");
    expect(parseLeadSourceParam("../../etc/passwd")).toBe("other");
    expect(parseLeadSourceParam("")).toBe("other");
    expect(parseLeadSourceParam(null)).toBe("other");
    expect(parseLeadSourceParam(undefined)).toBe("other");
  });
});

describe("parseOptionalUtm", () => {
  it("trims and caps UTM values", () => {
    expect(parseOptionalUtm("  google  ")).toBe("google");
    expect(parseOptionalUtm("x".repeat(250))?.length).toBe(200);
    expect(parseOptionalUtm("   ")).toBeNull();
  });
});
