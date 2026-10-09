import { describe, expect, it } from "vitest";
import {
  WEBSITE_SELECTABLE_THEME_IDS,
  WEBSITE_THEME_IDS,
  isWebsiteThemeId,
} from "@hcp/validators";
import {
  WEBSITE_THEME_REGISTRY,
  listSelectableWebsiteThemes,
} from "../src/website/domain/WebsiteTypes";
import { Website } from "../src/website/domain/Website";

describe("website theme registry", () => {
  it("registers exactly four selectable MVP themes plus unset", () => {
    expect(WEBSITE_SELECTABLE_THEME_IDS).toEqual([
      "luxury_villa",
      "boutique_hotel",
      "apartments_studios",
      "nature_retreat",
    ]);
    expect(listSelectableWebsiteThemes()).toHaveLength(4);
    expect(WEBSITE_THEME_IDS).toContain("unset");
    expect(WEBSITE_THEME_REGISTRY.map((t) => t.id)).toEqual([
      ...WEBSITE_THEME_IDS,
    ]);
  });

  it("accepts every registry theme id on the Website aggregate", () => {
    for (const themeId of WEBSITE_THEME_IDS) {
      const site = Website.create({
        id: "11111111-1111-4111-8111-111111111111",
        tenantId: "22222222-2222-4222-8222-222222222222",
        propertyId: "33333333-3333-4333-8333-333333333333",
        themeId,
      });
      expect(site.themeId).toBe(themeId);
    }
  });

  it("rejects unsupported theme ids without hardcoding luxury_villa checks", () => {
    expect(isWebsiteThemeId("luxury_villa")).toBe(true);
    expect(isWebsiteThemeId("neon_disco")).toBe(false);
    expect(() =>
      Website.create({
        id: "11111111-1111-4111-8111-111111111111",
        tenantId: "22222222-2222-4222-8222-222222222222",
        propertyId: "33333333-3333-4333-8333-333333333333",
        themeId: "neon_disco" as never,
      }),
    ).toThrow(/Unknown themeId/);
  });
});
