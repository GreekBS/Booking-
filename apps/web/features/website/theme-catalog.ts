import type { RenderableWebsiteThemeId } from "@/features/website-themes";
import { WEBSITE_SELECTABLE_THEME_IDS } from "@hcp/validators";

export type ThemeGalleryStatus = "ready" | "coming_soon";

export type ThemeGalleryEntry = {
  id: RenderableWebsiteThemeId;
  label: string;
  blurb: string;
  status: ThemeGalleryStatus;
  /** Local thumbnail under /public — demo art only. */
  thumbnailSrc: string;
};

/**
 * Operator gallery catalog. Only `ready` themes may be previewed or selected.
 * Adding a visual theme in B4 flips status — no migration.
 */
export const THEME_GALLERY_ENTRIES: readonly ThemeGalleryEntry[] = [
  {
    id: "luxury_villa",
    label: "Luxury villa",
    blurb:
      "Editorial Mediterranean hospitality — immersive photography, refined typography, suite storytelling.",
    status: "ready",
    thumbnailSrc: "/website-themes/luxury-villa/hero.svg",
  },
  {
    id: "boutique_hotel",
    label: "Boutique hotel",
    blurb:
      "Architectural editorial for independent hotels — split hero, numbered rooms, filmstrip gallery.",
    status: "ready",
    thumbnailSrc: "/website-themes/boutique-hotel/lobby.svg",
  },
  {
    id: "apartments_studios",
    label: "Apartments & studios",
    blurb:
      "Bright Mediterranean multi-unit stays — unit strips, airy sky palette, clear booking actions.",
    status: "ready",
    thumbnailSrc: "/website-themes/apartments-studios/balcony.svg",
  },
  {
    id: "nature_retreat",
    label: "Nature retreat",
    blurb: "Landscape-led retreats and eco lodges. Coming soon.",
    status: "coming_soon",
    thumbnailSrc: "/website-themes/luxury-villa/garden.svg",
  },
] as const;

export function getThemeGalleryEntry(
  themeId: string,
): ThemeGalleryEntry | undefined {
  return THEME_GALLERY_ENTRIES.find((e) => e.id === themeId);
}

export function isThemeSelectable(themeId: string): boolean {
  const entry = getThemeGalleryEntry(themeId);
  return entry?.status === "ready";
}

export function isThemePreviewable(themeId: string): boolean {
  return isThemeSelectable(themeId);
}

/** Fitness: catalog covers every selectable registry id. */
export function themeCatalogCoversRegistry(): boolean {
  const ids = new Set(THEME_GALLERY_ENTRIES.map((e) => e.id));
  return WEBSITE_SELECTABLE_THEME_IDS.every((id) => ids.has(id));
}
