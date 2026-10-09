import type { WebsiteDraftContent, WebsiteThemeId } from "@hcp/validators";
import {
  SAMPLE_PROPERTY_DISPLAY_NAME,
  SAMPLE_WEBSITE_DRAFT_CONTENT,
  buildSampleWebsiteDraftContent,
} from "./sample-content";
import {
  APARTMENTS_STUDIOS_DISPLAY_NAME,
  buildApartmentsStudiosSampleContent,
} from "./sample-apartments-studios";
import {
  BOUTIQUE_HOTEL_DISPLAY_NAME,
  buildBoutiqueHotelSampleContent,
} from "./sample-boutique-hotel";

export function getSampleWebsiteDraftForTheme(
  themeId: string,
): WebsiteDraftContent {
  if (themeId === "boutique_hotel") {
    return buildBoutiqueHotelSampleContent();
  }
  if (themeId === "apartments_studios") {
    return buildApartmentsStudiosSampleContent();
  }
  if (
    themeId === "luxury_villa" ||
    themeId === "nature_retreat" ||
    themeId === "unset"
  ) {
    return themeId === "luxury_villa" || themeId === "unset"
      ? SAMPLE_WEBSITE_DRAFT_CONTENT
      : buildSampleWebsiteDraftContent(themeId as WebsiteThemeId);
  }
  return SAMPLE_WEBSITE_DRAFT_CONTENT;
}

export function getSamplePropertyDisplayName(themeId: string): string {
  if (themeId === "boutique_hotel") return BOUTIQUE_HOTEL_DISPLAY_NAME;
  if (themeId === "apartments_studios") return APARTMENTS_STUDIOS_DISPLAY_NAME;
  return SAMPLE_PROPERTY_DISPLAY_NAME;
}
