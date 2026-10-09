import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  THEME_GALLERY_ENTRIES,
  isThemePreviewable,
  isThemeSelectable,
  themeCatalogCoversRegistry,
} from "@/features/website/theme-catalog";
import {
  AdminApiError,
  draftBundleToRenderContent,
  draftHasRenderableSections,
  formatWebsiteApiError,
} from "@/features/website/website-api";

const ROOT = process.cwd();

describe("website builder B3 gallery foundation", () => {
  it("catalog covers registry ids and only luxury_villa is selectable", () => {
    expect(themeCatalogCoversRegistry()).toBe(true);
    expect(THEME_GALLERY_ENTRIES).toHaveLength(4);
    expect(isThemeSelectable("luxury_villa")).toBe(true);
    expect(isThemePreviewable("luxury_villa")).toBe(true);
    expect(isThemeSelectable("boutique_hotel")).toBe(true);
    expect(isThemePreviewable("boutique_hotel")).toBe(true);
    for (const id of ["apartments_studios", "nature_retreat"]) {
      expect(isThemeSelectable(id)).toBe(false);
      expect(isThemePreviewable(id)).toBe(false);
    }
  });

  it("exposes gallery and preview dashboard routes (auth-gated app routes)", () => {
    expect(
      existsSync(
        join(ROOT, "app", "(dashboard)", "dashboard", "website", "themes", "page.tsx"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(
          ROOT,
          "app",
          "(dashboard)",
          "dashboard",
          "website",
          "themes",
          "[themeId]",
          "preview",
          "page.tsx",
        ),
      ),
    ).toBe(true);
  });

  it("gallery uses PATCH theme API and never mixes sample into draft mapping", () => {
    const gallery = readFileSync(
      join(ROOT, "features", "website", "ThemeGalleryPage.tsx"),
      "utf8",
    );
    expect(gallery).toContain("updateWebsiteTheme");
    expect(gallery).toContain("ConfirmDialog");
    expect(gallery).toContain("isThemeSelectable");
    expect(gallery).not.toMatch(/publishWebsite|customDomain/i);

    const preview = readFileSync(
      join(ROOT, "features", "website", "ThemePreviewPage.tsx"),
      "utf8",
    );
    expect(preview).toContain("getSampleWebsiteDraftForTheme");
    expect(preview).toContain("draftBundleToRenderContent");
    expect(preview).toContain("mode === \"sample\"");
    expect(preview).toMatch(/Δεν γίνεται ανάμειξη|ανάμειξη/);
  });

  it("maps draft bundles to render content without PMS fields", () => {
    const mapped = draftBundleToRenderContent(
      {
        id: "w1",
        tenantId: "t1",
        propertyId: "p1",
        status: "draft",
        themeId: "unset",
        contentSchemaVersion: 1,
        draftVersionId: "d1",
        publishedVersionId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "d1",
        tenantId: "t1",
        websiteId: "w1",
        versionNumber: 1,
        locale: "en",
        sections: [{ type: "hero" }],
        seo: { metaTitle: "X" },
        state: "draft",
        publishedAt: null,
        publishedBy: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    );
    expect(mapped.sections).toEqual([{ type: "hero" }]);
    expect(JSON.stringify(mapped)).not.toMatch(/booking|guest|payment|credential/i);
    expect(draftHasRenderableSections({ sections: [] } as never)).toBe(false);
  });

  it("surfaces 401/403/404/409 theme API errors", () => {
    expect(formatWebsiteApiError(new AdminApiError("x", "m", 401))).toMatch(/σύνδεση/i);
    expect(formatWebsiteApiError(new AdminApiError("x", "m", 403))).toMatch(/δικαίωμα/);
    expect(formatWebsiteApiError(new AdminApiError("x", "not found", 404))).toMatch(
      /δεν βρέθηκε/i,
    );
    expect(formatWebsiteApiError(new AdminApiError("x", "m", 409))).toMatch(
      /συγκρούστηκε|Ανανεώστε/,
    );
  });
});
