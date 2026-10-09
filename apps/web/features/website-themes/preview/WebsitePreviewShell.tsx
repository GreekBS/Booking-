"use client";

import { useState, type ReactNode } from "react";
import { WebsiteThemeRenderer } from "../WebsiteThemeRenderer";
import {
  SAMPLE_PROPERTY_DISPLAY_NAME,
  SAMPLE_WEBSITE_DRAFT_CONTENT,
} from "../sample/sample-content";
import {
  WEBSITE_PREVIEW_VIEWPORTS,
  type WebsitePreviewViewportId,
} from "./preview-viewports";

export type WebsitePreviewShellProps = {
  themeId: string;
  /**
   * Draft-shaped content. Defaults to fictional sample — never load PMS-private
   * fields here. Callers must only pass authorized, website-safe draft payloads.
   */
  content?: unknown;
  propertyDisplayName?: string;
  initialViewport?: WebsitePreviewViewportId;
  /** Optional chrome above the device frame (gallery will use this). */
  toolbarExtra?: ReactNode;
};

/**
 * Preview-only shell. Isolated React subtree (not iframe):
 * - Avoids srcdoc HTML serialization (XSS surface)
 * - Keeps sanitizer → React element path intact
 * - CSS containment + fixed frame widths simulate devices
 * - No routes, no DNS, no DB writes, no published rendering
 */
export function WebsitePreviewShell({
  themeId,
  content = SAMPLE_WEBSITE_DRAFT_CONTENT,
  propertyDisplayName = SAMPLE_PROPERTY_DISPLAY_NAME,
  initialViewport = "desktop",
  toolbarExtra,
}: WebsitePreviewShellProps) {
  const [viewport, setViewport] =
    useState<WebsitePreviewViewportId>(initialViewport);
  const frame = WEBSITE_PREVIEW_VIEWPORTS[viewport];

  return (
    <div
      className="wb-preview-shell flex flex-col gap-3"
      data-testid="wb-preview-shell"
      data-preview-only="true"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-md border border-border bg-background p-0.5"
          role="group"
          aria-label="Preview viewport"
        >
          {(
            Object.keys(WEBSITE_PREVIEW_VIEWPORTS) as WebsitePreviewViewportId[]
          ).map((id) => {
            const active = id === viewport;
            return (
              <button
                key={id}
                type="button"
                className={
                  active
                    ? "rounded px-2.5 py-1.5 text-xs font-medium bg-muted text-foreground"
                    : "rounded px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                }
                aria-pressed={active}
                data-testid={`wb-preview-viewport-${id}`}
                onClick={() => setViewport(id)}
              >
                {WEBSITE_PREVIEW_VIEWPORTS[id].label}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-muted-foreground">
          {frame.widthPx}px · preview only
        </span>
        {toolbarExtra}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 sm:p-4">
        <div
          className="mx-auto overflow-hidden rounded-md border border-border bg-white shadow-sm"
          style={{
            width: "100%",
            maxWidth: frame.widthPx,
            contain: "layout paint style",
          }}
          data-testid="wb-preview-frame"
          data-viewport={viewport}
        >
          <div className="max-h-[70vh] overflow-y-auto">
            <WebsiteThemeRenderer
              themeId={themeId}
              content={content}
              context={{
                propertyDisplayName,
                viewport,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
