import type { ThemeConfig } from "@hcp/storefront-sdk";

export type EmbedMode = "inline" | "modal" | "iframe";

export interface EmbedConfig {
  publishableKey: string;
  unitId?: string;
  propertySlug?: string;
  locale?: string;
  currency?: string;
  mode?: EmbedMode;
  theme?: Partial<ThemeConfig>;
  mockMode?: boolean;
  baseUrl?: string;
  containerId?: string;
  iframeBaseUrl?: string;
}

export const EMBED_DATA_ATTRIBUTES = {
  key: "data-hcp-key",
  unit: "data-hcp-unit",
  property: "data-hcp-property",
  locale: "data-hcp-locale",
  currency: "data-hcp-currency",
  mode: "data-hcp-mode",
  theme: "data-hcp-theme",
  mock: "data-hcp-mock",
  baseUrl: "data-hcp-base-url",
  container: "data-hcp-container",
} as const;

export interface ParsedEmbedAttributes {
  publishableKey: string;
  unitId?: string;
  propertySlug?: string;
  locale?: string;
  currency?: string;
  mode?: EmbedMode;
  themeJson?: string;
  mockMode?: boolean;
  baseUrl?: string;
  containerId?: string;
}

export function parseEmbedAttributes(
  element: Pick<HTMLElement, "getAttribute">,
): ParsedEmbedAttributes {
  const publishableKey = element.getAttribute(EMBED_DATA_ATTRIBUTES.key);
  if (!publishableKey) {
    throw new Error("Missing data-hcp-key");
  }
  const mockAttr = element.getAttribute(EMBED_DATA_ATTRIBUTES.mock);
  return {
    publishableKey,
    unitId: element.getAttribute(EMBED_DATA_ATTRIBUTES.unit) ?? undefined,
    propertySlug: element.getAttribute(EMBED_DATA_ATTRIBUTES.property) ?? undefined,
    locale: element.getAttribute(EMBED_DATA_ATTRIBUTES.locale) ?? undefined,
    currency: element.getAttribute(EMBED_DATA_ATTRIBUTES.currency) ?? undefined,
    mode: (element.getAttribute(EMBED_DATA_ATTRIBUTES.mode) as EmbedMode | null) ?? undefined,
    themeJson: element.getAttribute(EMBED_DATA_ATTRIBUTES.theme) ?? undefined,
    mockMode: mockAttr === null ? undefined : mockAttr === "true",
    baseUrl: element.getAttribute(EMBED_DATA_ATTRIBUTES.baseUrl) ?? undefined,
    containerId: element.getAttribute(EMBED_DATA_ATTRIBUTES.container) ?? undefined,
  };
}

export function embedConfigFromAttributes(attrs: ParsedEmbedAttributes): EmbedConfig {
  let theme: Partial<ThemeConfig> | undefined;
  if (attrs.themeJson) {
    theme = JSON.parse(attrs.themeJson) as Partial<ThemeConfig>;
  }
  return {
    publishableKey: attrs.publishableKey,
    unitId: attrs.unitId,
    propertySlug: attrs.propertySlug,
    locale: attrs.locale,
    currency: attrs.currency,
    mode: attrs.mode ?? "inline",
    theme,
    mockMode: attrs.mockMode ?? !attrs.baseUrl,
    baseUrl: attrs.baseUrl,
    containerId: attrs.containerId,
  };
}
