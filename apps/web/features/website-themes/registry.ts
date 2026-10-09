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
import { BoutiqueHotelLayout } from "./themes/boutique-hotel/BoutiqueHotelLayout";
import { renderBoutiqueHotelSection } from "./themes/boutique-hotel/BoutiqueHotelSections";
import { LuxuryVillaLayout } from "./themes/luxury-villa/LuxuryVillaLayout";
import { renderLuxuryVillaSection } from "./themes/luxury-villa/LuxuryVillaSections";

const ALL_SECTIONS = WEBSITE_SECTION_TYPES;

/**
 * Code theme rendering registry (no DB table).
 * Each theme may supply its own Layout + section renderer without migrations.
 */
const THEME_DEFINITIONS: Record<
  RenderableWebsiteThemeId,
  WebsiteThemeDefinition
> = {
  luxury_villa: {
    id: "luxury_villa",
    label: "Luxury villa",
    supportedSectionTypes: ALL_SECTIONS,
    Layout: LuxuryVillaLayout,
    renderSection: renderLuxuryVillaSection,
  },
  boutique_hotel: {
    id: "boutique_hotel",
    label: "Boutique hotel",
    supportedSectionTypes: ALL_SECTIONS,
    Layout: BoutiqueHotelLayout,
    renderSection: renderBoutiqueHotelSection,
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
