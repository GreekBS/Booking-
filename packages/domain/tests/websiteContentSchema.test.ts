import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  parseWebsiteDraftContent,
  safeParseWebsiteDraftContent,
  WEBSITE_CONTENT_SCHEMA_VERSION,
  WEBSITE_RICHTEXT_SANITIZATION_CONTRACT,
  WEBSITE_SELECTABLE_THEME_IDS,
} from "@hcp/validators";

function validDraft(overrides: Record<string, unknown> = {}) {
  return {
    contentSchemaVersion: WEBSITE_CONTENT_SCHEMA_VERSION,
    locale: "el",
    themeId: "unset",
    seo: {
      metaTitle: "Villa Aegean",
      metaDescription: "Sea view villa",
    },
    sections: [
      {
        id: randomUUID(),
        type: "hero",
        sortOrder: 0,
        visible: true,
        headline: "Welcome",
        ctaUrl: "https://example.com/book",
      },
      {
        id: randomUUID(),
        type: "gallery",
        sortOrder: 1,
        visible: true,
        assetIds: [randomUUID()],
        layout: "grid",
      },
    ],
    ...overrides,
  };
}

describe("websiteDraftContentSchema (contentSchemaVersion=1)", () => {
  it("accepts a valid draft payload", () => {
    const parsed = parseWebsiteDraftContent(validDraft());
    expect(parsed.contentSchemaVersion).toBe(1);
    expect(parsed.sections).toHaveLength(2);
    expect(parsed.themeId).toBe("unset");
  });

  it("rejects unknown section types", () => {
    const result = safeParseWebsiteDraftContent(
      validDraft({
        sections: [
          {
            id: randomUUID(),
            type: "script",
            sortOrder: 0,
            visible: true,
            body: "<script>alert(1)</script>",
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects javascript: CTA URLs", () => {
    const result = safeParseWebsiteDraftContent(
      validDraft({
        sections: [
          {
            id: randomUUID(),
            type: "hero",
            sortOrder: 0,
            visible: true,
            headline: "Hack",
            ctaUrl: "javascript:alert(1)",
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects duplicate section ids", () => {
    const id = randomUUID();
    const result = safeParseWebsiteDraftContent(
      validDraft({
        sections: [
          {
            id,
            type: "hero",
            sortOrder: 0,
            visible: true,
            headline: "A",
          },
          {
            id,
            type: "richtext",
            sortOrder: 1,
            visible: true,
            body: "B",
          },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects wrong contentSchemaVersion", () => {
    const result = safeParseWebsiteDraftContent(
      validDraft({ contentSchemaVersion: 2 }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects unknown theme ids", () => {
    const result = safeParseWebsiteDraftContent(
      validDraft({ themeId: "neon_disco" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects unknown SEO keys (strict)", () => {
    const result = safeParseWebsiteDraftContent(
      validDraft({
        seo: { metaTitle: "Ok", evil: true },
      }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts root-relative CTA URLs", () => {
    const parsed = parseWebsiteDraftContent(
      validDraft({
        sections: [
          {
            id: randomUUID(),
            type: "cta",
            sortOrder: 0,
            visible: true,
            headline: "Book",
            buttonLabel: "Reserve",
            buttonUrl: "/book",
          },
        ],
      }),
    );
    expect(parsed.sections[0]?.type).toBe("cta");
  });

  it("accepts all four selectable theme ids", () => {
    for (const themeId of WEBSITE_SELECTABLE_THEME_IDS) {
      const parsed = parseWebsiteDraftContent(validDraft({ themeId }));
      expect(parsed.themeId).toBe(themeId);
    }
  });

  it("documents richtext sanitization as a render-boundary obligation", () => {
    expect(WEBSITE_RICHTEXT_SANITIZATION_CONTRACT.status).toBe(
      "deferred_to_render_boundary",
    );
    expect(WEBSITE_RICHTEXT_SANITIZATION_CONTRACT.forbiddenUrlSchemes).toContain(
      "javascript:",
    );
    // Opaque body still accepted at Zod layer (sanitizer is not A2).
    const parsed = parseWebsiteDraftContent(
      validDraft({
        sections: [
          {
            id: randomUUID(),
            type: "richtext",
            sortOrder: 0,
            visible: true,
            body: "<p>Hello</p><script>alert(1)</script>",
          },
        ],
      }),
    );
    expect(parsed.sections[0]?.type).toBe("richtext");
  });
});
