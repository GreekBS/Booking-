import type { ComponentType, ReactNode } from "react";
import type {
  WebsiteDraftContent,
  WebsiteSection,
  WebsiteSectionType,
  WebsiteThemeId,
} from "@hcp/validators";
import { WEBSITE_SELECTABLE_THEME_IDS } from "@hcp/validators";

/** Theme ids that may resolve to a renderer (`unset` is never renderable). */
export type RenderableWebsiteThemeId =
  (typeof WEBSITE_SELECTABLE_THEME_IDS)[number];

export function isRenderableWebsiteThemeId(
  value: string,
): value is RenderableWebsiteThemeId {
  return (WEBSITE_SELECTABLE_THEME_IDS as readonly string[]).includes(value);
}

export type WebsiteThemePreviewContext = {
  /** Public-safe display name only — never PMS-private fields. */
  propertyDisplayName?: string;
  /** Preview viewport hint for theme-owned responsive tweaks. */
  viewport?: "desktop" | "tablet" | "mobile";
};

export type ThemeLayoutProps = {
  themeId: RenderableWebsiteThemeId;
  content: WebsiteDraftContent;
  /** Visible, theme-supported sections in sort order. */
  sections: WebsiteSection[];
  /** Sections present in content but not supported by this theme (skipped). */
  skippedSectionTypes: WebsiteSectionType[];
  context: WebsiteThemePreviewContext;
  /** Renders a single validated section via shared foundation adapters. */
  renderSection: (section: WebsiteSection) => ReactNode;
};

/**
 * Code theme contract. Visual Layout is theme-owned — B1 ships foundation stubs;
 * B2+ replace Layout implementations without migrations.
 */
export type WebsiteThemeDefinition = {
  id: RenderableWebsiteThemeId;
  label: string;
  supportedSectionTypes: readonly WebsiteSectionType[];
  Layout: ComponentType<ThemeLayoutProps>;
  /**
   * Optional theme-owned section renderer. When omitted, the foundation
   * adapters are used — keeps Luxury Villa (and future themes) out of the
   * shared WebsiteThemeRenderer switch.
   */
  renderSection?: (section: WebsiteSection) => ReactNode;
};

export type WebsiteThemeRenderInput = {
  themeId: WebsiteThemeId | string;
  content: unknown;
  context?: WebsiteThemePreviewContext;
};

export type WebsiteThemeRenderSuccess = {
  ok: true;
  themeId: RenderableWebsiteThemeId;
  content: WebsiteDraftContent;
  sections: WebsiteSection[];
  skippedSectionTypes: WebsiteSectionType[];
};

export type WebsiteThemeRenderFailure = {
  ok: false;
  code:
    | "THEME_UNSET"
    | "THEME_UNKNOWN"
    | "THEME_UNSUPPORTED"
    | "CONTENT_INVALID";
  message: string;
  issues?: unknown;
};

export type WebsiteThemeRenderPrepareResult =
  | WebsiteThemeRenderSuccess
  | WebsiteThemeRenderFailure;
