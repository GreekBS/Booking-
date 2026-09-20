/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";
import { MarketingFunnelProvider } from "@/components/marketing/MarketingFunnelProvider";
import { MarketingButton } from "@/components/marketing/MarketingButton";
import { parseGetStartedHref } from "@/components/marketing/get-started-cta";

afterEach(() => cleanup());

describe("parseGetStartedHref", () => {
  it("extracts allowlisted source and UTMs", () => {
    expect(
      parseGetStartedHref(
        "/get-started?source=homepage_hero&utm_source=ads&utm_medium=cpc&utm_campaign=spring",
      ),
    ).toEqual({
      source: "homepage_hero",
      utmSource: "ads",
      utmMedium: "cpc",
      utmCampaign: "spring",
    });
  });

  it("falls back safely for untrusted sources", () => {
    expect(parseGetStartedHref("/get-started?source=EVIL")).toMatchObject({
      source: "other",
    });
  });

  it("returns null for non get-started hrefs", () => {
    expect(parseGetStartedHref("/contact")).toBeNull();
  });
});

describe("Get Started overlay CTA", () => {
  it("opens overlay with source from CTA without navigation", async () => {
    const user = userEvent.setup();
    render(
      <div className="talos-marketing">
        <MarketingFunnelProvider>
          <MarketingButton href="/get-started?source=homepage_hero">
            Get started
          </MarketingButton>
        </MarketingFunnelProvider>
      </div>,
    );

    await user.click(screen.getByRole("button", { name: /Get started/i }));
    expect(screen.getByTestId("get-started-overlay")).toBeTruthy();
    expect(screen.getByText(/Step 1 of 5/i)).toBeTruthy();

    await user.click(screen.getByTestId("get-started-overlay-close"));
    expect(screen.queryByTestId("get-started-overlay")).toBeNull();
  });
});
