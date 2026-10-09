import {
  WEBSITE_SECTION_TYPES,
  type WebsiteSectionType,
} from "@hcp/validators";
import type {
  RenderableWebsiteThemeId,
  WebsiteThemeDefinition,
} from "./contracts";
import { isRenderableWebsiteThemeId } from "./contracts";
import { FoundationThemeLayout } from "./themes/FoundationThemeLayout";

const ALL_SECTIONS = WEBSITE_SECTION_TYPES;

/**
 * Code theme rendering registry (no DB table).
 * B1 registers four selectable themes with foundation Layout stubs.
 * B2+ swap Layout implementations per theme without migrations.
 */
const THEME_DEFINITIONS: Record<
  RenderableWebsiteThemeId,
  WebsiteThemeDefinition
> = {
  luxury_villa: {
    id: "luxury_villa",
    label: "Luxury villa",
    supportedSectionTypes: ALL_SECTIONS,
    Layout: FoundationThemeLayout,
  },
  boutique_hotel: {
    id: "boutique_hotel",
    label: "Boutique hotel",
    supportedSectionTypes: ALL_SECTIONS,
    Layout: FoundationThemeLayout,
  },
  apartments_studios: {
    id: "apartments_studios",
    label: "Apartments & studios",
    supportedSectionTypes: ALL_SECTIONS,
    Layout: FoundationThemeLayout,
  },
  nature_retreat: {
    id: "nature_retreat",
    label: "Nature retreat",
    supportedSectionTypes: ALL_SECTIONS,
    Layout: FoundationThemeLayout,
  },
};

export function listRenderableWebsiteThemes(): readonly WebsiteThemeDefinition[] {
  return Object.values(THEME_DEFINITIONS);
}

export function getWebsiteThemeDefinition(
  themeId: string,
): WebsiteThemeDefinition | null {
  if (!isRenderableWebsiteThemeId(themeId)) return null;
  return THEME_DEFINITIONS[themeId] ?? null;
}

export function themeSupportsSection(
  theme: WebsiteThemeDefinition,
  sectionType: WebsiteSectionType,
): boolean {
  return theme.supportedSectionTypes.includes(sectionType);
}
