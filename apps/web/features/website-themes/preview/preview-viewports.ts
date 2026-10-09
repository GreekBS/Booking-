export const WEBSITE_PREVIEW_VIEWPORTS = {
  desktop: { id: "desktop", label: "Desktop", widthPx: 1280 },
  tablet: { id: "tablet", label: "Tablet", widthPx: 768 },
  mobile: { id: "mobile", label: "Mobile", widthPx: 390 },
} as const;

export type WebsitePreviewViewportId = keyof typeof WEBSITE_PREVIEW_VIEWPORTS;

export function isWebsitePreviewViewportId(
  value: string,
): value is WebsitePreviewViewportId {
  return value in WEBSITE_PREVIEW_VIEWPORTS;
}
