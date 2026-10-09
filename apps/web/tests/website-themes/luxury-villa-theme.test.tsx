/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  SAMPLE_WEBSITE_DRAFT_CONTENT,
  WebsitePreviewShell,
  WebsiteThemeRenderer,
  buildSampleWebsiteDraftContent,
  getWebsiteThemeDefinition,
} from "@/features/website-themes";

afterEach(() => {
  cleanup();
});

describe("Luxury Villa theme (B2)", () => {
  it("registers Luxury Villa with its own Layout and section renderer", () => {
    const theme = getWebsiteThemeDefinition("luxury_villa");
    expect(theme?.id).toBe("luxury_villa");
    expect(theme?.renderSection).toBeTypeOf("function");
    expect(theme?.Layout).toBeTruthy();
  });

  it("keeps unfinished themes on foundation layout (not Luxury Villa)", () => {
    for (const id of ["apartments_studios", "nature_retreat"] as const) {
      const theme = getWebsiteThemeDefinition(id);
      expect(theme?.renderSection).toBeUndefined();
      render(
        <WebsiteThemeRenderer
          themeId={id}
          content={buildSampleWebsiteDraftContent(id)}
        />,
      );
      expect(screen.getByTestId("wb-theme-foundation")).toBeInTheDocument();
      expect(screen.queryByTestId("lv-theme-root")).toBeNull();
      expect(screen.queryByTestId("bh-theme-root")).toBeNull();
      cleanup();
    }
  });

  it("renders the full sample section set", () => {
    render(
      <WebsiteThemeRenderer
        themeId="luxury_villa"
        content={SAMPLE_WEBSITE_DRAFT_CONTENT}
        context={{ propertyDisplayName: "Villa Thalassa" }}
      />,
    );

    expect(screen.getByTestId("lv-theme-root")).toHaveAttribute(
      "data-theme-id",
      "luxury_villa",
    );
    expect(screen.getByTestId("lv-hero-location")).toHaveTextContent(
      /Demo destination/i,
    );
    expect(screen.queryByText(/Aegean · Private villa/i)).toBeNull();
    expect(screen.getByTestId("lv-section-hero")).toBeInTheDocument();
    expect(screen.getByTestId("lv-section-intro")).toBeInTheDocument();
    expect(screen.getByTestId("lv-section-split")).toBeInTheDocument();
    expect(screen.getByTestId("lv-section-gallery")).toBeInTheDocument();
    expect(screen.getByTestId("lv-section-amenities")).toBeInTheDocument();
    expect(screen.getByTestId("lv-section-accommodation")).toBeInTheDocument();
    expect(screen.getByTestId("lv-section-location")).toBeInTheDocument();
    expect(screen.getByTestId("lv-section-nearby")).toBeInTheDocument();
    expect(screen.getByTestId("lv-section-faq")).toBeInTheDocument();
    expect(screen.getByTestId("lv-section-cta")).toBeInTheDocument();
    expect(screen.getByTestId("lv-footer")).toBeInTheDocument();
  });

  it("handles missing optional content gracefully", () => {
    const sparse = {
      ...SAMPLE_WEBSITE_DRAFT_CONTENT,
      seo: {},
      sections: [
        {
          id: "b1000000-0000-4000-8000-000000000201",
          type: "hero" as const,
          sortOrder: 0,
          visible: true,
          headline: "Sparse villa",
        },
        {
          id: "b1000000-0000-4000-8000-000000000202",
          type: "gallery" as const,
          sortOrder: 1,
          visible: true,
          assetIds: [] as string[],
          layout: "grid" as const,
        },
        {
          id: "b1000000-0000-4000-8000-000000000203",
          type: "amenities" as const,
          sortOrder: 2,
          visible: true,
          displayMode: "from_catalog" as const,
        },
      ],
    };

    render(<WebsiteThemeRenderer themeId="luxury_villa" content={sparse} />);
    expect(screen.getByTestId("lv-section-hero")).toHaveTextContent("Sparse villa");
    expect(screen.queryByTestId("lv-hero-location")).toBeNull();
    expect(screen.getByTestId("lv-section-gallery")).toHaveTextContent(
      /coming soon/i,
    );
    expect(screen.getByTestId("lv-section-amenities")).toHaveTextContent(
      /when configured/i,
    );
  });

  it("sanitizes richtext in Luxury Villa intro", () => {
    const poisoned = {
      ...SAMPLE_WEBSITE_DRAFT_CONTENT,
      sections: SAMPLE_WEBSITE_DRAFT_CONTENT.sections.map((s) =>
        s.type === "richtext"
          ? {
              ...s,
              body: '<p>Stone walls</p><script>alert(1)</script><img src=x onerror="alert(2)">',
            }
          : s,
      ),
    };
    const { container } = render(
      <WebsiteThemeRenderer themeId="luxury_villa" content={poisoned} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toContain("onerror=");
    expect(screen.getByTestId("lv-section-intro")).toHaveTextContent("Stone walls");
  });

  it("exposes accessible navigation and FAQ disclosure", async () => {
    const user = userEvent.setup();
    render(
      <WebsiteThemeRenderer
        themeId="luxury_villa"
        content={SAMPLE_WEBSITE_DRAFT_CONTENT}
        context={{ propertyDisplayName: "Villa Thalassa", viewport: "mobile" }}
      />,
    );

    expect(screen.getByText("Skip to content")).toHaveAttribute("href", "#story");
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();

    const faq = screen.getByTestId("lv-section-faq");
    const summary = within(faq).getByText(/Is Villa Thalassa a real property/i);
    await user.click(summary);
    expect(faq).toHaveTextContent(/sample preview content/i);
  });

  it("preview shell can show Luxury Villa at reduced viewports", async () => {
    const user = userEvent.setup();
    render(
      <WebsitePreviewShell
        themeId="luxury_villa"
        propertyDisplayName="Villa Thalassa"
      />,
    );
    expect(screen.getByTestId("lv-theme-root")).toBeInTheDocument();
    await user.click(screen.getByTestId("wb-preview-viewport-mobile"));
    expect(screen.getByTestId("lv-theme-root")).toHaveAttribute(
      "data-viewport",
      "mobile",
    );
    expect(screen.getByTestId("wb-preview-frame")).toHaveAttribute(
      "data-viewport",
      "mobile",
    );
  });

  it("uses local placeholder media paths (no external CDN)", () => {
    const { container } = render(
      <WebsiteThemeRenderer
        themeId="luxury_villa"
        content={SAMPLE_WEBSITE_DRAFT_CONTENT}
      />,
    );
    const images = Array.from(container.querySelectorAll("img"));
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      const src = img.getAttribute("src") ?? "";
      expect(src.startsWith("/website-themes/luxury-villa/")).toBe(true);
      expect(src).not.toMatch(/^https?:\/\//);
    }
  });
});
