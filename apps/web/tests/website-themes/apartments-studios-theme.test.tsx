/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  WebsitePreviewShell,
  WebsiteThemeRenderer,
  buildApartmentsStudiosSampleContent,
  getWebsiteThemeDefinition,
  validateWebsiteRenderContent,
} from "@/features/website-themes";
import { isThemeSelectable as gallerySelectable } from "@/features/website/theme-catalog";

afterEach(() => {
  cleanup();
});

describe("Apartments & Studios theme (B4b)", () => {
  it("registers Apartments & Studios with dedicated Layout and section renderer", () => {
    const theme = getWebsiteThemeDefinition("apartments_studios");
    expect(theme?.id).toBe("apartments_studios");
    expect(theme?.renderSection).toBeTypeOf("function");
    expect(theme?.Layout).toBeTruthy();
    expect(gallerySelectable("apartments_studios")).toBe(true);
  });

  it("validates apartments sample content against Zod v1", () => {
    const sample = buildApartmentsStudiosSampleContent();
    const parsed = validateWebsiteRenderContent(sample);
    expect(parsed.ok).toBe(true);
    expect(sample.themeId).toBe("apartments_studios");
    expect(sample.sections.length).toBeGreaterThan(5);
  });

  it("renders all primary apartments sections from sample", () => {
    render(
      <WebsiteThemeRenderer
        themeId="apartments_studios"
        content={buildApartmentsStudiosSampleContent()}
        context={{ propertyDisplayName: "Nereida Apartments" }}
      />,
    );
    expect(screen.getByTestId("as-theme-root")).toHaveAttribute(
      "data-theme-id",
      "apartments_studios",
    );
    expect(screen.getByTestId("as-section-hero")).toBeInTheDocument();
    expect(screen.getByTestId("as-section-intro")).toBeInTheDocument();
    expect(screen.getByTestId("as-section-split")).toBeInTheDocument();
    expect(screen.getByTestId("as-section-units")).toBeInTheDocument();
    expect(screen.getByTestId("as-section-gallery")).toBeInTheDocument();
    expect(screen.getByTestId("as-section-amenities")).toBeInTheDocument();
    expect(screen.getByTestId("as-section-location")).toBeInTheDocument();
    expect(screen.getByTestId("as-section-nearby")).toBeInTheDocument();
    expect(screen.getByTestId("as-section-faq")).toBeInTheDocument();
    expect(screen.getByTestId("as-section-cta")).toBeInTheDocument();
    expect(screen.getByTestId("as-footer")).toBeInTheDocument();
    expect(screen.queryByTestId("lv-theme-root")).toBeNull();
    expect(screen.queryByTestId("bh-theme-root")).toBeNull();
  });

  it("derives hero location from content and omits when missing", () => {
    render(
      <WebsiteThemeRenderer
        themeId="apartments_studios"
        content={buildApartmentsStudiosSampleContent()}
      />,
    );
    expect(screen.getByTestId("as-hero-location")).toHaveTextContent(
      /Demo coastal lane/i,
    );

    cleanup();
    const sparse = {
      ...buildApartmentsStudiosSampleContent(),
      seo: {},
      sections: [
        {
          id: "f3000000-0000-4000-8000-000000000201",
          type: "hero" as const,
          sortOrder: 0,
          visible: true,
          headline: "Sparse apartments",
        },
        {
          id: "f3000000-0000-4000-8000-000000000202",
          type: "gallery" as const,
          sortOrder: 1,
          visible: true,
          assetIds: [] as string[],
          layout: "grid" as const,
        },
      ],
    };
    render(
      <WebsiteThemeRenderer themeId="apartments_studios" content={sparse} />,
    );
    expect(screen.queryByTestId("as-hero-location")).toBeNull();
    expect(screen.getByTestId("as-section-gallery")).toHaveTextContent(
      /coming soon/i,
    );
  });

  it("sanitizes richtext in apartments intro", () => {
    const sample = buildApartmentsStudiosSampleContent();
    const poisoned = {
      ...sample,
      sections: sample.sections.map((s) =>
        s.type === "richtext"
          ? {
              ...s,
              body: '<p>Sunny terrace</p><script>alert(1)</script><img src=x onerror="alert(2)">',
            }
          : s,
      ),
    };
    const { container } = render(
      <WebsiteThemeRenderer themeId="apartments_studios" content={poisoned} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toContain("onerror=");
    expect(screen.getByTestId("as-section-intro")).toHaveTextContent(
      "Sunny terrace",
    );
  });

  it("uses apartments-studios local media paths (not villa or boutique)", () => {
    const { container } = render(
      <WebsiteThemeRenderer
        themeId="apartments_studios"
        content={buildApartmentsStudiosSampleContent()}
      />,
    );
    const images = Array.from(container.querySelectorAll("img"));
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      const src = img.getAttribute("src") ?? "";
      expect(src.startsWith("/website-themes/apartments-studios/")).toBe(true);
      expect(src).not.toContain("/luxury-villa/");
      expect(src).not.toContain("/boutique-hotel/");
    }
  });

  it("supports preview shell viewport switching", async () => {
    const user = userEvent.setup();
    render(
      <WebsitePreviewShell
        themeId="apartments_studios"
        content={buildApartmentsStudiosSampleContent()}
        propertyDisplayName="Nereida Apartments"
      />,
    );
    expect(screen.getByTestId("as-theme-root")).toBeInTheDocument();
    await user.click(screen.getByTestId("wb-preview-viewport-mobile"));
    expect(screen.getByTestId("as-theme-root")).toHaveAttribute(
      "data-viewport",
      "mobile",
    );
  });

  it("does not regress Luxury Villa or Boutique Hotel; Nature Retreat stays unavailable", () => {
    expect(gallerySelectable("luxury_villa")).toBe(true);
    expect(gallerySelectable("boutique_hotel")).toBe(true);
    expect(gallerySelectable("apartments_studios")).toBe(true);
    expect(gallerySelectable("nature_retreat")).toBe(false);
  });
});
