import { describe, expect, it } from "vitest";
import { isPublicMarketingPath } from "@/lib/marketing/site";

describe("isPublicMarketingPath", () => {
  it("allows homepage and supporting marketing routes", () => {
    expect(isPublicMarketingPath("/")).toBe(true);
    expect(isPublicMarketingPath("/pms")).toBe(true);
    expect(isPublicMarketingPath("/website-builder")).toBe(true);
    expect(isPublicMarketingPath("/property-management")).toBe(true);
    expect(isPublicMarketingPath("/channel-manager")).toBe(true);
    expect(isPublicMarketingPath("/direct-bookings")).toBe(true);
    expect(isPublicMarketingPath("/vacation-rental-software")).toBe(true);
    expect(isPublicMarketingPath("/contact")).toBe(true);
  });

  it("does not treat Super Admin /platform as marketing", () => {
    expect(isPublicMarketingPath("/platform")).toBe(false);
    expect(isPublicMarketingPath("/platform/tenants")).toBe(false);
  });

  it("does not open authenticated app areas", () => {
    expect(isPublicMarketingPath("/dashboard")).toBe(false);
    expect(isPublicMarketingPath("/dashboard/properties")).toBe(false);
    expect(isPublicMarketingPath("/login")).toBe(false);
    expect(isPublicMarketingPath("/api/admin/v1/me")).toBe(false);
  });
});
