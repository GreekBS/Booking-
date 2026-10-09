/**
 * Website Builder domain contracts (aligned with A1 persistence + phase-4 CMS design).
 * Theme ids + Zod contentSchemaVersion=1 schemas: @hcp/validators.
 */

import {
  WEBSITE_CONTENT_SCHEMA_VERSION as VALIDATORS_CONTENT_SCHEMA_VERSION,
  WEBSITE_SECTION_TYPES,
  WEBSITE_SELECTABLE_THEME_IDS,
  WEBSITE_THEME_IDS,
  isWebsiteThemeId,
  type WebsiteThemeId,
} from "@hcp/validators";

export const WEBSITE_CONTENT_SCHEMA_VERSION = VALIDATORS_CONTENT_SCHEMA_VERSION;

export {
  WEBSITE_THEME_IDS,
  WEBSITE_SELECTABLE_THEME_IDS,
  isWebsiteThemeId,
  type WebsiteThemeId,
};

export const WEBSITE_STATUSES = ["draft", "published", "unpublished"] as const;
export type WebsiteStatus = (typeof WEBSITE_STATUSES)[number];

export const WEBSITE_VERSION_STATES = ["draft", "published", "superseded"] as const;
export type WebsiteVersionState = (typeof WEBSITE_VERSION_STATES)[number];

export function isWebsiteStatus(value: string): value is WebsiteStatus {
  return (WEBSITE_STATUSES as readonly string[]).includes(value);
}

export function isWebsiteVersionState(value: string): value is WebsiteVersionState {
  return (WEBSITE_VERSION_STATES as readonly string[]).includes(value);
}

/** Theme registry contract — rendering adapters register against these ids later. */
export interface WebsiteThemeContract {
  id: WebsiteThemeId;
  /** Human label for operator UI (not persisted). */
  label: string;
  /** Section types the theme expects to render well (advisory for editors). */
  supportedSectionTypes: readonly string[];
}

const ALL_SECTION_TYPES = WEBSITE_SECTION_TYPES;

/**
 * Code theme registry. Four MVP gallery themes + `unset`.
 * Layout/CSS implementations arrive in a later PR — ids only here.
 */
export const WEBSITE_THEME_REGISTRY: readonly WebsiteThemeContract[] = [
  {
    id: "unset",
    label: "Unset",
    supportedSectionTypes: ALL_SECTION_TYPES,
  },
  {
    id: "luxury_villa",
    label: "Luxury villa",
    supportedSectionTypes: ALL_SECTION_TYPES,
  },
  {
    id: "boutique_hotel",
    label: "Boutique hotel",
    supportedSectionTypes: ALL_SECTION_TYPES,
  },
  {
    id: "apartments_studios",
    label: "Apartments & studios",
    supportedSectionTypes: ALL_SECTION_TYPES,
  },
  {
    id: "nature_retreat",
    label: "Nature retreat",
    supportedSectionTypes: ALL_SECTION_TYPES,
  },
] as const;

/** Convenience: gallery entries operators can pick (excludes unset). */
export function listSelectableWebsiteThemes(): readonly WebsiteThemeContract[] {
  return WEBSITE_THEME_REGISTRY.filter((t) => t.id !== "unset");
}
