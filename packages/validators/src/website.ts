/**
 * Website Builder content contracts (contentSchemaVersion = 1).
 *
 * Stable shape for future themes / editors / storefront consumers.
 * Additive section types only within v1; breaking changes → version 2.
 * No arbitrary HTML at section root (XSS mitigation) — richtext body only.
 */
import { z } from "zod";
import { WEBSITE_THEME_IDS } from "./websiteThemes";

export {
  WEBSITE_THEME_IDS,
  WEBSITE_SELECTABLE_THEME_IDS,
  isWebsiteThemeId,
  type WebsiteThemeId,
} from "./websiteThemes";

export const WEBSITE_CONTENT_SCHEMA_VERSION = 1 as const;

export const WEBSITE_STATUSES = ["draft", "published", "unpublished"] as const;
export const WEBSITE_VERSION_STATES = ["draft", "published", "superseded"] as const;

/**
 * Richtext sanitization contract for future public / preview HTML rendering.
 *
 * A2 Zod accepts an opaque string only (length-capped). It does NOT sanitize.
 * Before any HTML is emitted to browsers (public site, iframe preview, emails):
 *
 * 1. Parse as a restricted markdown or HTML subset (never raw passthrough).
 * 2. Strip `<script>`, `<iframe>`, `<object>`, `<embed>`, `<form>`, and SVG script.
 * 3. Strip event-handler attributes (`on*`) and `style` expression URLs.
 * 4. Allow only `http:`, `https:`, `mailto:`, and root-relative (`/…`) href/src.
 * 5. Reject `javascript:`, `data:`, `vbscript:` URL schemes.
 * 6. Prefer server-side sanitization at the render boundary (not editor-only).
 *
 * Domain publish/save must keep rejecting unsafe CTA/section URLs via Zod;
 * richtext body sanitization is an infrastructure render obligation.
 */
export const WEBSITE_RICHTEXT_SANITIZATION_CONTRACT = {
  status: "deferred_to_render_boundary",
  contentSchemaVersion: WEBSITE_CONTENT_SCHEMA_VERSION,
  forbiddenTags: [
    "script",
    "iframe",
    "object",
    "embed",
    "form",
    "link",
    "meta",
    "base",
  ],
  forbiddenUrlSchemes: ["javascript:", "data:", "vbscript:"],
  allowedUrlSchemes: ["http:", "https:", "mailto:"],
  allowRootRelativeUrls: true,
  stripEventHandlerAttributes: true,
} as const;

export const WEBSITE_SECTION_TYPES = [
  "hero",
  "gallery",
  "richtext",
  "amenities",
  "location",
  "highlights",
  "policies",
  "faq",
  "cta",
  "split",
] as const;
export type WebsiteSectionType = (typeof WEBSITE_SECTION_TYPES)[number];

const uuid = z.string().uuid();

/** Reject javascript:/data: URLs and require http(s) or site-relative paths. */
const safeUrl = z
  .string()
  .max(2048)
  .refine(
    (value) => {
      const v = value.trim();
      if (!v) return false;
      const lower = v.toLowerCase();
      if (
        lower.startsWith("javascript:") ||
        lower.startsWith("data:") ||
        lower.startsWith("vbscript:")
      ) {
        return false;
      }
      if (v.startsWith("/")) return true;
      try {
        const u = new URL(v);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "URL must be http(s) or a root-relative path" },
  );

const sectionBase = z.object({
  id: uuid,
  sortOrder: z.number().int().min(0).max(10_000),
  visible: z.boolean().default(true),
  settings: z.record(z.unknown()).optional(),
});

const highlightItemSchema = z.object({
  icon: z.string().max(64).optional(),
  title: z.string().min(1).max(120),
  text: z.string().max(500).optional(),
});

const faqItemSchema = z.object({
  question: z.string().min(1).max(300),
  answer: z.string().min(1).max(4000),
});

const amenityCustomItemSchema = z.object({
  label: z.string().min(1).max(100),
  icon: z.string().max(64).optional(),
});

const policyItemSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().max(4000),
});

const heroSectionSchema = sectionBase.extend({
  type: z.literal("hero"),
  headline: z.string().min(1).max(200),
  subheadline: z.string().max(500).optional(),
  backgroundAssetId: uuid.nullable().optional(),
  ctaLabel: z.string().max(80).optional(),
  ctaUrl: safeUrl.optional(),
});

const gallerySectionSchema = sectionBase.extend({
  type: z.literal("gallery"),
  assetIds: z.array(uuid).max(50),
  layout: z.enum(["grid", "carousel"]).default("grid"),
});

const richtextSectionSchema = sectionBase.extend({
  type: z.literal("richtext"),
  /**
   * Opaque body string. Not sanitized here — see
   * {@link WEBSITE_RICHTEXT_SANITIZATION_CONTRACT}.
   */
  body: z.string().max(50_000),
});

const amenitiesSectionSchema = sectionBase.extend({
  type: z.literal("amenities"),
  displayMode: z.enum(["from_catalog", "custom"]).default("from_catalog"),
  customItems: z.array(amenityCustomItemSchema).max(100).optional(),
});

const locationSectionSchema = sectionBase.extend({
  type: z.literal("location"),
  showMap: z.boolean().default(true),
  directionsText: z.string().max(4000).optional(),
});

const highlightsSectionSchema = sectionBase.extend({
  type: z.literal("highlights"),
  items: z.array(highlightItemSchema).max(20),
});

const policiesSectionSchema = sectionBase.extend({
  type: z.literal("policies"),
  syncFromCatalog: z.boolean().default(false),
  items: z.array(policyItemSchema).max(30).optional(),
});

const faqSectionSchema = sectionBase.extend({
  type: z.literal("faq"),
  items: z.array(faqItemSchema).max(40),
});

const ctaSectionSchema = sectionBase.extend({
  type: z.literal("cta"),
  headline: z.string().min(1).max(200),
  buttonLabel: z.string().min(1).max(80),
  buttonUrl: safeUrl.optional(),
  widgetEmbed: z.boolean().optional(),
});

const splitSectionSchema = sectionBase.extend({
  type: z.literal("split"),
  assetId: uuid.nullable().optional(),
  headline: z.string().min(1).max(200),
  body: z.string().max(10_000),
  imagePosition: z.enum(["left", "right"]).default("left"),
});

export const websiteSectionSchema = z.discriminatedUnion("type", [
  heroSectionSchema,
  gallerySectionSchema,
  richtextSectionSchema,
  amenitiesSectionSchema,
  locationSectionSchema,
  highlightsSectionSchema,
  policiesSectionSchema,
  faqSectionSchema,
  ctaSectionSchema,
  splitSectionSchema,
]);

export type WebsiteSection = z.infer<typeof websiteSectionSchema>;

export const websiteSeoSchema = z
  .object({
    metaTitle: z.string().max(70).optional(),
    metaDescription: z.string().max(200).optional(),
    canonicalUrl: safeUrl.optional(),
    robots: z.string().max(64).optional(),
    ogTitle: z.string().max(70).optional(),
    ogDescription: z.string().max(200).optional(),
    ogImageAssetId: uuid.nullable().optional(),
    twitterCard: z.enum(["summary", "summary_large_image"]).optional(),
    structuredDataHints: z.record(z.unknown()).optional(),
  })
  .strict();

export type WebsiteSeo = z.infer<typeof websiteSeoSchema>;

export const websiteThemeIdSchema = z.enum(WEBSITE_THEME_IDS);

/**
 * Full draft payload validated before persisting a WebsiteVersion snapshot.
 * Themes consume sections + seo + themeId; schema version gates migrations.
 */
export const websiteDraftContentSchema = z
  .object({
    contentSchemaVersion: z.literal(WEBSITE_CONTENT_SCHEMA_VERSION),
    locale: z
      .string()
      .min(2)
      .max(16)
      .regex(/^[a-z]{2}(-[A-Za-z0-9]+)?$/, "Invalid BCP-47 primary locale"),
    sections: z.array(websiteSectionSchema).max(40),
    seo: websiteSeoSchema.default({}),
    themeId: websiteThemeIdSchema.default("unset"),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ids = value.sections.map((s) => s.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Section ids must be unique within a version",
        path: ["sections"],
      });
    }
  });

export type WebsiteDraftContent = z.infer<typeof websiteDraftContentSchema>;

export function parseWebsiteDraftContent(input: unknown): WebsiteDraftContent {
  return websiteDraftContentSchema.parse(input);
}

export function safeParseWebsiteDraftContent(input: unknown) {
  return websiteDraftContentSchema.safeParse(input);
}

export function parseWebsiteSections(input: unknown): WebsiteSection[] {
  return z.array(websiteSectionSchema).max(40).parse(input);
}

export function parseWebsiteSeo(input: unknown): WebsiteSeo {
  return websiteSeoSchema.parse(input ?? {});
}
