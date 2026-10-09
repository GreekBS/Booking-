/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getWebsiteBundle = vi.fn();
let modeParam = "sample";
const replace = vi.fn((url: string) => {
  const u = new URL(url, "http://localhost");
  modeParam = u.searchParams.get("mode") ?? "sample";
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(`mode=${modeParam}`),
  usePathname: () => "/dashboard/website/themes/luxury_villa/preview",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/website/website-api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/website/website-api")
  >("@/features/website/website-api");
  return {
    ...actual,
    getWebsiteBundle: (...args: unknown[]) => getWebsiteBundle(...args),
  };
});

vi.mock("@/hooks/use-tenant", () => ({
  useTenant: () => ({
    tenantId: "tenant-1",
    profile: {
      user: { id: "u1", platformRole: null },
      memberships: [{ tenantId: "tenant-1", role: "admin", propertyIds: null }],
    },
    loading: false,
    error: null,
  }),
  renderTenantGate: () => null,
}));

vi.mock("@/hooks/use-active-property", () => ({
  useActiveProperty: () => ({
    propertyId: "prop-1",
    property: { id: "prop-1", name: "Villa Test" },
    properties: [{ id: "prop-1", name: "Villa Test" }],
    ready: true,
    error: null,
  }),
  renderActivePropertyGate: () => null,
}));

import { ThemePreviewPage } from "@/features/website/ThemePreviewPage";
import { AdminApiError } from "@/features/website/website-api";
import { SAMPLE_WEBSITE_DRAFT_CONTENT } from "@/features/website-themes";

describe("ThemePreviewPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    getWebsiteBundle.mockReset();
    replace.mockClear();
    modeParam = "sample";
  });

  it("renders Luxury Villa sample preview with device switcher", async () => {
    const user = userEvent.setup();
    render(<ThemePreviewPage themeId="luxury_villa" />);
    expect(await screen.findByTestId("theme-preview-page")).toHaveAttribute(
      "data-preview-mode",
      "sample",
    );
    expect(screen.getByTestId("lv-theme-root")).toBeInTheDocument();
    expect(screen.getByTestId("wb-preview-shell")).toBeInTheDocument();
    await user.click(screen.getByTestId("wb-preview-viewport-tablet"));
    expect(screen.getByTestId("wb-preview-frame")).toHaveAttribute(
      "data-viewport",
      "tablet",
    );
    await user.click(screen.getByTestId("wb-preview-viewport-mobile"));
    expect(screen.getByTestId("wb-preview-frame")).toHaveAttribute(
      "data-viewport",
      "mobile",
    );
  });

  it("blocks coming-soon theme preview", async () => {
    render(<ThemePreviewPage themeId="boutique_hotel" />);
    expect(
      await screen.findByTestId("theme-preview-unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("wb-preview-shell")).toBeNull();
  });

  it("shows empty draft state without mixing sample content", async () => {
    modeParam = "draft";
    getWebsiteBundle.mockResolvedValue({
      website: {
        id: "w1",
        tenantId: "tenant-1",
        propertyId: "prop-1",
        status: "draft",
        themeId: "unset",
        contentSchemaVersion: 1,
        draftVersionId: "d1",
        publishedVersionId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      draft: {
        id: "d1",
        tenantId: "tenant-1",
        websiteId: "w1",
        versionNumber: 1,
        locale: "en",
        sections: [],
        seo: {},
        state: "draft",
        publishedAt: null,
        publishedBy: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      published: null,
    });

    render(<ThemePreviewPage themeId="luxury_villa" />);
    expect(await screen.findByText(/Κενό πρόχειρο/)).toBeInTheDocument();
    expect(screen.queryByTestId("lv-theme-root")).toBeNull();
    expect(screen.getByText(/Δεν γίνεται ανάμειξη/)).toBeInTheDocument();
  });

  it("renders authorized draft content when sections exist", async () => {
    modeParam = "draft";
    getWebsiteBundle.mockResolvedValue({
      website: {
        id: "w1",
        tenantId: "tenant-1",
        propertyId: "prop-1",
        status: "draft",
        themeId: "luxury_villa",
        contentSchemaVersion: 1,
        draftVersionId: "d1",
        publishedVersionId: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      draft: {
        id: "d1",
        tenantId: "tenant-1",
        websiteId: "w1",
        versionNumber: 1,
        locale: "en",
        sections: SAMPLE_WEBSITE_DRAFT_CONTENT.sections,
        seo: SAMPLE_WEBSITE_DRAFT_CONTENT.seo,
        state: "draft",
        publishedAt: null,
        publishedBy: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      published: null,
    });

    render(<ThemePreviewPage themeId="luxury_villa" />);
    expect(await screen.findByTestId("lv-theme-root")).toBeInTheDocument();
    expect(getWebsiteBundle).toHaveBeenCalledWith("tenant-1", "prop-1");
  });

  it("surfaces draft load 401 errors", async () => {
    modeParam = "draft";
    getWebsiteBundle.mockRejectedValue(
      new AdminApiError("UNAUTHORIZED", "auth", 401),
    );
    render(<ThemePreviewPage themeId="luxury_villa" />);
    expect(await screen.findByTestId("theme-preview-draft-error")).toHaveTextContent(
      /σύνδεση/i,
    );
  });

  it("switches mode via toggle without silent sample merge", async () => {
    const user = userEvent.setup();
    modeParam = "sample";
    render(<ThemePreviewPage themeId="luxury_villa" />);
    await screen.findByTestId("theme-preview-page");
    await user.click(screen.getByTestId("theme-preview-mode-draft"));
    await waitFor(() => {
      expect(replace).toHaveBeenCalled();
      expect(String(replace.mock.calls.at(-1)?.[0])).toContain("mode=draft");
    });
  });
});
