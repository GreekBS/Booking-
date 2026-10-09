/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getWebsiteBundle = vi.fn();
const updateWebsiteTheme = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard/website/themes",
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
    updateWebsiteTheme: (...args: unknown[]) => updateWebsiteTheme(...args),
  };
});

const tenantState = {
  role: "admin" as string,
  platformRole: null as string | null,
};

vi.mock("@/hooks/use-tenant", () => ({
  useTenant: () => ({
    tenantId: "tenant-1",
    profile: {
      user: { id: "u1", platformRole: tenantState.platformRole },
      memberships: [
        { tenantId: "tenant-1", role: tenantState.role, propertyIds: null },
      ],
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

import { ThemeGalleryPage } from "@/features/website/ThemeGalleryPage";
import { AdminApiError } from "@/features/website/website-api";

const bundle = {
  website: {
    id: "w1",
    tenantId: "tenant-1",
    propertyId: "prop-1",
    status: "draft",
    themeId: "unset",
    contentSchemaVersion: 1,
    draftVersionId: "d1",
    publishedVersionId: "pub-1",
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
  published: {
    id: "pub-1",
    tenantId: "tenant-1",
    websiteId: "w1",
    versionNumber: 2,
    locale: "en",
    sections: [{ type: "hero" }],
    seo: {},
    state: "published",
    publishedAt: "2026-01-02T00:00:00.000Z",
    publishedBy: "u1",
    createdAt: "2026-01-02T00:00:00.000Z",
  },
};

describe("ThemeGalleryPage", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    getWebsiteBundle.mockReset();
    updateWebsiteTheme.mockReset();
    push.mockReset();
    tenantState.role = "admin";
    getWebsiteBundle.mockResolvedValue(bundle);
  });

  it("renders four theme cards and disables unfinished selection", async () => {
    render(<ThemeGalleryPage />);
    expect(await screen.findByTestId("theme-gallery-page")).toBeInTheDocument();
    expect(screen.getByTestId("theme-card-luxury_villa")).toHaveAttribute(
      "data-theme-status",
      "ready",
    );
    expect(screen.getByTestId("theme-card-boutique_hotel")).toHaveAttribute(
      "data-theme-status",
      "ready",
    );
    expect(screen.getByTestId("theme-card-apartments_studios")).toHaveAttribute(
      "data-theme-status",
      "ready",
    );
    expect(screen.getByTestId("theme-select-boutique_hotel")).toBeEnabled();
    expect(screen.getByTestId("theme-select-apartments_studios")).toBeEnabled();
    expect(screen.getByTestId("theme-preview-apartments_studios")).toBeEnabled();
    expect(screen.getByTestId("theme-select-disabled-nature_retreat")).toBeDisabled();
    expect(screen.getByTestId("theme-preview-disabled-nature_retreat")).toBeDisabled();
    expect(screen.getByTestId("theme-select-luxury_villa")).toBeEnabled();
  });

  it("selects Luxury Villa after confirmation without changing published snapshot id in optimistic state", async () => {
    const user = userEvent.setup();
    updateWebsiteTheme.mockResolvedValue({
      website: { ...bundle.website, themeId: "luxury_villa" },
    });
    getWebsiteBundle
      .mockResolvedValueOnce(bundle)
      .mockResolvedValueOnce({
        ...bundle,
        website: { ...bundle.website, themeId: "luxury_villa" },
      });

    render(<ThemeGalleryPage />);
    await screen.findByTestId("theme-gallery-page");
    await user.click(screen.getByTestId("theme-select-luxury_villa"));
    expect(screen.getByText(/Επιβεβαίωση θέματος/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Επιλογή θέματος/i }));

    await waitFor(() => {
      expect(updateWebsiteTheme).toHaveBeenCalledWith(
        "tenant-1",
        "prop-1",
        "luxury_villa",
      );
    });
    expect(updateWebsiteTheme.mock.calls).toHaveLength(1);
  });

  it("shows API error on 403 theme selection", async () => {
    const user = userEvent.setup();
    updateWebsiteTheme.mockRejectedValueOnce(
      new AdminApiError("FORBIDDEN", "nope", 403),
    );
    render(<ThemeGalleryPage />);
    await screen.findByTestId("theme-gallery-page");
    await user.click(screen.getByTestId("theme-select-luxury_villa"));
    await user.click(screen.getByRole("button", { name: /Επιλογή θέματος/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/δικαίωμα/);
  });

  it("navigates to Luxury Villa preview", async () => {
    const user = userEvent.setup();
    render(<ThemeGalleryPage />);
    await screen.findByTestId("theme-gallery-page");
    await user.click(screen.getByTestId("theme-preview-luxury_villa"));
    expect(push).toHaveBeenCalledWith(
      "/dashboard/website/themes/luxury_villa/preview?mode=sample",
    );
  });

  it("hides select for staff role", async () => {
    tenantState.role = "staff";
    render(<ThemeGalleryPage />);
    await screen.findByTestId("theme-gallery-page");
    expect(screen.getByTestId("theme-select-luxury_villa")).toBeDisabled();
  });
});
