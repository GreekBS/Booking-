import type { WebsiteSection, WebsiteSectionType } from "@hcp/validators";
import type {
  WebsiteThemePreviewContext,
  WebsiteThemeRenderPrepareResult,
} from "./contracts";
import { isRenderableWebsiteThemeId } from "./contracts";
import { getWebsiteThemeDefinition } from "./registry";
import { validateWebsiteRenderContent } from "./validate-content";

function sortVisibleSections(sections: WebsiteSection[]): WebsiteSection[] {
  return [...sections]
    .filter((s) => s.visible !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Filter validated sections to those the theme declares support for. */
export function filterSectionsForTheme(
  supportedSectionTypes: readonly WebsiteSectionType[],
  sections: WebsiteSection[],
): {
  sections: WebsiteSection[];
  skippedSectionTypes: WebsiteSectionType[];
} {
  const visible = sortVisibleSections(sections);
  const kept: WebsiteSection[] = [];
  const skippedSectionTypes: WebsiteSectionType[] = [];
  for (const section of visible) {
    if (supportedSectionTypes.includes(section.type)) {
      kept.push(section);
    } else if (!skippedSectionTypes.includes(section.type)) {
      skippedSectionTypes.push(section.type);
    }
  }
  return { sections: kept, skippedSectionTypes };
}

/**
 * Validate + resolve theme + filter sections for rendering.
 * Pure — no I/O, no DB writes.
 */
export function prepareWebsiteThemeRender(input: {
  themeId: string;
  content: unknown;
  context?: WebsiteThemePreviewContext;
}): WebsiteThemeRenderPrepareResult {
  if (input.themeId === "unset") {
    return {
      ok: false,
      code: "THEME_UNSET",
      message: "Select a theme before previewing.",
    };
  }

  if (!isRenderableWebsiteThemeId(input.themeId)) {
    return {
      ok: false,
      code: "THEME_UNKNOWN",
      message: `Unknown or unsupported theme id: ${input.themeId}`,
    };
  }

  const theme = getWebsiteThemeDefinition(input.themeId);
  if (!theme) {
    return {
      ok: false,
      code: "THEME_UNSUPPORTED",
      message: `No renderer registered for theme: ${input.themeId}`,
    };
  }

  const validated = validateWebsiteRenderContent(input.content);
  if (!validated.ok) {
    return {
      ok: false,
      code: "CONTENT_INVALID",
      message: validated.message,
      issues: validated.issues,
    };
  }

  const filtered = filterSectionsForTheme(
    theme.supportedSectionTypes,
    validated.content.sections,
  );

  return {
    ok: true,
    themeId: theme.id,
    content: validated.content,
    sections: filtered.sections,
    skippedSectionTypes: filtered.skippedSectionTypes,
  };
}
