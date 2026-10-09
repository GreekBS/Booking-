/**
 * Website Builder theme id registry (code-only — no DB theme table).
 * Adding a theme = append id here + register renderer later; no migration.
 *
 * Four planned MVP themes (plus `unset` before selection):
 * - luxury_villa
 * - boutique_hotel
 * - apartments_studios
 * - nature_retreat
 */
export const WEBSITE_THEME_IDS = [
  "unset",
  "luxury_villa",
  "boutique_hotel",
  "apartments_studios",
  "nature_retreat",
] as const;

export type WebsiteThemeId = (typeof WEBSITE_THEME_IDS)[number];

/** Selectable gallery themes (excludes the unset placeholder). */
export const WEBSITE_SELECTABLE_THEME_IDS = [
  "luxury_villa",
  "boutique_hotel",
  "apartments_studios",
  "nature_retreat",
] as const satisfies readonly WebsiteThemeId[];

export function isWebsiteThemeId(value: string): value is WebsiteThemeId {
  return (WEBSITE_THEME_IDS as readonly string[]).includes(value);
}
