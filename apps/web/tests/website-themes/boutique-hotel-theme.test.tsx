/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  WebsitePreviewShell,
  WebsiteThemeRenderer,
  buildBoutiqueHotelSampleContent,
  getWebsiteThemeDefinition,
  validateWebsiteRenderContent,
} from "@/features/website-themes";
import { isThemeSelectable as gallerySelectable } from "@/features/website/theme-catalog";

afterEach(() => {
  cleanup();
});

describe("Boutique Hotel theme (B4a)", () => {
  it("registers Boutique Hotel with dedicated Layout and section renderer", () => {
    const theme = getWebsiteThemeDefinition("boutique_hotel");
    expect(theme?.id).toBe("boutique_hotel");
    expect(theme?.renderSection).toBeTypeOf("function");
    expect(theme?.Layout).toBeTruthy();
    expect(gallerySelectable("boutique_hotel")).toBe(true);
  });

  it("validates boutique sample content against Zod v1", () => {
    const sample = buildBoutiqueHotelSampleContent();
    const parsed = validateWebsiteRenderContent(sample);
    expect(parsed.ok).toBe(true);
    expect(sample.themeId).toBe("boutique_hotel");
    expect(sample.sections.length).toBeGreaterThan(5);
  });

  it("renders all primary boutique sections from sample", () => {
    render(
      <WebsiteThemeRenderer
        themeId="boutique_hotel"
        content={buildBoutiqueHotelSampleContent()}
        context={{ propertyDisplayName: "Maison Clarisse" }}
      />,
    );
    expect(screen.getByTestId("bh-theme-root")).toHaveAttribute(
      "data-theme-id",
      "boutique_hotel",
    );
    expect(screen.getByTestId("bh-section-hero")).toBeInTheDocument();
    expect(screen.getByTestId("bh-section-intro")).toBeInTheDocument();
    expect(screen.getByTestId("bh-section-split")).toBeInTheDocument();
    expect(screen.getByTestId("bh-section-rooms")).toBeInTheDocument();
    expect(screen.getByTestId("bh-section-gallery")).toBeInTheDocument();
    expect(screen.getByTestId("bh-section-amenities")).toBeInTheDocument();
    expect(screen.getByTestId("bh-section-location")).toBeInTheDocument();
    expect(screen.getByTestId("bh-section-nearby")).toBeInTheDocument();
    expect(screen.getByTestId("bh-section-faq")).toBeInTheDocument();
    expect(screen.getByTestId("bh-section-cta")).toBeInTheDocument();
    expect(screen.getByTestId("bh-footer")).toBeInTheDocument();
    expect(screen.queryByTestId("lv-theme-root")).toBeNull();
  });

  it("derives hero location from content and omits when missing", () => {
    render(
      <WebsiteThemeRenderer
        themeId="boutique_hotel"
        content={buildBoutiqueHotelSampleContent()}
      />,
    );
    expect(screen.getByTestId("bh-hero-location")).toHaveTextContent(
      /Demo district/i,
    );

    cleanup();
    const sparse = {
      ...buildBoutiqueHotelSampleContent(),
      seo: {},
      sections: [
        {
          id: "d2000000-0000-4000-8000-000000000201",
          type: "hero" as const,
          sortOrder: 0,
          visible: true,
          headline: "Sparse hotel",
        },
        {
          id: "d2000000-0000-4000-8000-000000000202",
          type: "gallery" as const,
          sortOrder: 1,
          visible: true,
          assetIds: [] as string[],
          layout: "carousel" as const,
        },
      ],
    };
    render(<WebsiteThemeRenderer themeId="boutique_hotel" content={sparse} />);
    expect(screen.queryByTestId("bh-hero-location")).toBeNull();
    expect(screen.getByTestId("bh-section-gallery")).toHaveTextContent(
      /coming soon/i,
    );
  });

  it("sanitizes richtext in boutique intro", () => {
    const sample = buildBoutiqueHotelSampleContent();
    const poisoned = {
      ...sample,
      sections: sample.sections.map((s) =>
        s.type === "richtext"
          ? {
              ...s,
              body: '<p>Lobby light</p><script>alert(1)</script><img src=x onerror="alert(2)">',
            }
          : s,
      ),
    };
    const { container } = render(
      <WebsiteThemeRenderer themeId="boutique_hotel" content={poisoned} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toContain("onerror=");
    expect(screen.getByTestId("bh-section-intro")).toHaveTextContent("Lobby light");
  });

  it("uses boutique-hotel local media paths (not luxury-villa)", () => {
    const { container } = render(
      <WebsiteThemeRenderer
        themeId="boutique_hotel"
        content={buildBoutiqueHotelSampleContent()}
      />,
    );
    const images = Array.from(container.querySelectorAll("img"));
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      const src = img.getAttribute("src") ?? "";
      expect(src.startsWith("/website-themes/boutique-hotel/")).toBe(true);
      expect(src).not.toContain("/luxury-villa/");
    }
  });

  it("supports preview shell viewport switching", async () => {
    const user = userEvent.setup();
    render(
      <WebsitePreviewShell
        themeId="boutique_hotel"
        content={buildBoutiqueHotelSampleContent()}
        propertyDisplayName="Maison Clarisse"
      />,
    );
    expect(screen.getByTestId("bh-theme-root")).toBeInTheDocument();
    await user.click(screen.getByTestId("wb-preview-viewport-mobile"));
    expect(screen.getByTestId("bh-theme-root")).toHaveAttribute(
      "data-viewport",
      "mobile",
    );
  });

  it("does not regress Luxury Villa readiness", () => {
    expect(gallerySelectable("luxury_villa")).toBe(true);
    expect(gallerySelectable("apartments_studios")).toBe(false);
    expect(gallerySelectable("nature_retreat")).toBe(false);
  });
});
