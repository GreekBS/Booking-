import { describe, expect, it } from "vitest";
import {
  filterSectionsForTheme,
  getWebsiteThemeDefinition,
  isRenderableWebsiteThemeId,
  listRenderableWebsiteThemes,
  prepareWebsiteThemeRender,
  buildSampleWebsiteDraftContent,
  SAMPLE_WEBSITE_DRAFT_CONTENT,
  validateWebsiteRenderContent,
} from "@/features/website-themes";
import { WEBSITE_SELECTABLE_THEME_IDS } from "@hcp/validators";

describe("website theme registry + prepare", () => {
  it("registers all selectable theme ids and rejects unset as renderable", () => {
    const ids = listRenderableWebsiteThemes().map((t) => t.id).sort();
    expect(ids).toEqual([...WEBSITE_SELECTABLE_THEME_IDS].sort());
    expect(isRenderableWebsiteThemeId("unset")).toBe(false);
    expect(getWebsiteThemeDefinition("unset")).toBeNull();
  });

  it("resolves known themes and rejects unknown ids", () => {
    expect(getWebsiteThemeDefinition("luxury_villa")?.label).toMatch(/villa/i);
    expect(getWebsiteThemeDefinition("not_a_theme")).toBeNull();

    const unknown = prepareWebsiteThemeRender({
      themeId: "neon_disco",
      content: SAMPLE_WEBSITE_DRAFT_CONTENT,
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe("THEME_UNKNOWN");
  });

  it("rejects unset theme without rendering", () => {
    const result = prepareWebsiteThemeRender({
      themeId: "unset",
      content: SAMPLE_WEBSITE_DRAFT_CONTENT,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("THEME_UNSET");
  });

  it("rejects invalid content", () => {
    const invalid = prepareWebsiteThemeRender({
      themeId: "luxury_villa",
      content: { contentSchemaVersion: 1, locale: "en", sections: "nope" },
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.code).toBe("CONTENT_INVALID");

    const schema = validateWebsiteRenderContent({ foo: 1 });
    expect(schema.ok).toBe(false);
  });

  it("skips unknown/unsupported section types for a theme", () => {
    const sample = buildSampleWebsiteDraftContent("boutique_hotel");
    const filtered = filterSectionsForTheme(
      ["hero", "cta"],
      sample.sections,
    );
    expect(filtered.sections.every((s) => s.type === "hero" || s.type === "cta")).toBe(
      true,
    );
    expect(filtered.skippedSectionTypes.length).toBeGreaterThan(0);
    expect(filtered.skippedSectionTypes).not.toContain("hero");
  });

  it("omits invisible sections", () => {
    const sample = buildSampleWebsiteDraftContent();
    const withHidden = {
      ...sample,
      sections: sample.sections.map((s, i) =>
        i === 0 ? { ...s, visible: false } : s,
      ),
    };
    const prepared = prepareWebsiteThemeRender({
      themeId: "luxury_villa",
      content: withHidden,
    });
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      expect(prepared.sections.some((s) => s.type === "hero")).toBe(false);
    }
  });

  it("validates sample content against Zod v1", () => {
    const parsed = validateWebsiteRenderContent(SAMPLE_WEBSITE_DRAFT_CONTENT);
    expect(parsed.ok).toBe(true);
    for (const themeId of WEBSITE_SELECTABLE_THEME_IDS) {
      const draft = buildSampleWebsiteDraftContent(themeId);
      expect(draft.themeId).toBe(themeId);
      expect(draft.sections.length).toBeGreaterThan(5);
    }
  });
});
