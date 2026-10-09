/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  SAMPLE_WEBSITE_DRAFT_CONTENT,
  WebsitePreviewShell,
  WebsiteThemeRenderer,
  buildSampleWebsiteDraftContent,
} from "@/features/website-themes";

afterEach(() => {
  cleanup();
});

describe("WebsiteThemeRenderer + preview shell", () => {
  it("renders sample content for a registered theme", () => {
    render(
      <WebsiteThemeRenderer
        themeId="luxury_villa"
        content={SAMPLE_WEBSITE_DRAFT_CONTENT}
        context={{ propertyDisplayName: "Villa Thalassa" }}
      />,
    );
    expect(screen.getByTestId("wb-theme-renderer")).toHaveAttribute(
      "data-theme-id",
      "luxury_villa",
    );
    expect(screen.getByTestId("wb-theme-foundation")).toBeInTheDocument();
    expect(screen.getByTestId("wb-section-hero")).toHaveTextContent(
      /Aegean meets stillness/i,
    );
    expect(screen.getByTestId("wb-section-faq")).toBeInTheDocument();
    expect(screen.getByTestId("wb-section-cta")).toBeInTheDocument();
  });

  it("shows error for unknown theme", () => {
    render(
      <WebsiteThemeRenderer
        themeId="unknown_theme"
        content={SAMPLE_WEBSITE_DRAFT_CONTENT}
      />,
    );
    expect(screen.getByTestId("wb-theme-render-error")).toHaveAttribute(
      "data-error-code",
      "THEME_UNKNOWN",
    );
  });

  it("shows error for invalid content", () => {
    render(
      <WebsiteThemeRenderer themeId="nature_retreat" content={{ bad: true }} />,
    );
    expect(screen.getByTestId("wb-theme-render-error")).toHaveAttribute(
      "data-error-code",
      "CONTENT_INVALID",
    );
  });

  it("does not render script payloads from richtext", () => {
    const content = buildSampleWebsiteDraftContent("apartments_studios");
    const poisoned = {
      ...content,
      sections: content.sections.map((s) =>
        s.type === "richtext"
          ? {
              ...s,
              body: '<p>Intro</p><script>window.__xss=1</script><img src=x onerror="window.__xss=2">',
            }
          : s,
      ),
    };
    const { container } = render(
      <WebsiteThemeRenderer
        themeId="apartments_studios"
        content={poisoned}
      />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toContain("onerror=");
    expect(screen.getByTestId("wb-section-richtext")).toHaveTextContent("Intro");
  });

  it("preview shell switches viewports without writing state APIs", async () => {
    const user = userEvent.setup();
    render(<WebsitePreviewShell themeId="boutique_hotel" />);

    expect(screen.getByTestId("wb-preview-shell")).toHaveAttribute(
      "data-preview-only",
      "true",
    );
    expect(screen.getByTestId("wb-preview-frame")).toHaveAttribute(
      "data-viewport",
      "desktop",
    );

    await user.click(screen.getByTestId("wb-preview-viewport-mobile"));
    expect(screen.getByTestId("wb-preview-frame")).toHaveAttribute(
      "data-viewport",
      "mobile",
    );
    expect(screen.getByTestId("wb-theme-foundation")).toHaveAttribute(
      "data-viewport",
      "mobile",
    );

    await user.click(screen.getByTestId("wb-preview-viewport-tablet"));
    expect(screen.getByTestId("wb-preview-frame")).toHaveAttribute(
      "data-viewport",
      "tablet",
    );
  });
});
