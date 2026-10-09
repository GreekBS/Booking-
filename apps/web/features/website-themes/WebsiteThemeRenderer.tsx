"use client";

import type { ReactNode } from "react";
import type {
  WebsiteThemePreviewContext,
  WebsiteThemeRenderFailure,
} from "./contracts";
import { prepareWebsiteThemeRender } from "./prepare-render";
import { getWebsiteThemeDefinition } from "./registry";
import { renderFoundationSection } from "./sections/FoundationSectionViews";

export type WebsiteThemeRendererProps = {
  themeId: string;
  /** Zod v1 draft-shaped content (validated before render). */
  content: unknown;
  context?: WebsiteThemePreviewContext;
  /** Optional override for failure UI (tests / gallery). */
  renderError?: (failure: WebsiteThemeRenderFailure) => ReactNode;
};

function DefaultRenderError({
  failure,
}: {
  failure: WebsiteThemeRenderFailure;
}) {
  return (
    <div
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive"
      data-testid="wb-theme-render-error"
      data-error-code={failure.code}
      role="alert"
    >
      <p className="font-medium">Preview unavailable</p>
      <p className="mt-1 text-destructive/90">{failure.message}</p>
    </div>
  );
}

/**
 * Secure theme rendering entry point for preview (and later public/storefront).
 * Validates content, resolves registry theme, dispatches sections — no DB I/O.
 */
export function WebsiteThemeRenderer({
  themeId,
  content,
  context = {},
  renderError,
}: WebsiteThemeRendererProps) {
  const prepared = prepareWebsiteThemeRender({ themeId, content, context });
  if (!prepared.ok) {
    return renderError ? (
      renderError(prepared)
    ) : (
      <DefaultRenderError failure={prepared} />
    );
  }

  const theme = getWebsiteThemeDefinition(prepared.themeId);
  if (!theme) {
    return (
      <DefaultRenderError
        failure={{
          ok: false,
          code: "THEME_UNSUPPORTED",
          message: `No renderer registered for theme: ${prepared.themeId}`,
        }}
      />
    );
  }

  const { Layout } = theme;
  const renderSection = theme.renderSection ?? renderFoundationSection;
  return (
    <div data-testid="wb-theme-renderer" data-theme-id={prepared.themeId}>
      <Layout
        themeId={prepared.themeId}
        content={prepared.content}
        sections={prepared.sections}
        skippedSectionTypes={prepared.skippedSectionTypes}
        context={context}
        renderSection={renderSection}
      />
    </div>
  );
}
