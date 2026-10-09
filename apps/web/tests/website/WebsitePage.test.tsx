/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getWebsiteBundle = vi.fn();
const ensureWebsite = vi.fn();

vi.mock("@/features/website/website-api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/website/website-api")
  >("@/features/website/website-api");
  return {
    ...actual,
    getWebsiteBundle: (...args: unknown[]) => getWebsiteBundle(...args),
    ensureWebsite: (...args: unknown[]) => ensureWebsite(...args),
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
        {
          tenantId: "tenant-1",
          role: tenantState.role,
          propertyIds: tenantState.role === "manager" ? ["prop-1"] : null,
        },
      ],
    },
    loading: false,
    error: null,
  }),
  renderTenantGate: () => null,
}));

const propertyState = {
  propertyId: "prop-1",
  property: { id: "prop-1", name: "Villa Test" },
  properties: [{ id: "prop-1", name: "Villa Test" }],
  ready: true,
  error: null as string | null,
};

vi.mock("@/hooks/use-active-property", () => ({
  useActiveProperty: () => propertyState,
  renderActivePropertyGate: () => null,
}));

import { WebsitePage } from "@/features/website/WebsitePage";
import { AdminApiError } from "@/features/website/website-api";

const draftBundle = {
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
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  draft: {
    id: "d1",
    tenantId: "tenant-1",
    websiteId: "w1",
    versionNumber: 1,
    locale: "el",
    sections: [{ type: "hero" }],
    seo: {},
    state: "draft",
    publishedAt: null,
    publishedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  published: null,
};

describe("WebsitePage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    getWebsiteBundle.mockReset();
    ensureWebsite.mockReset();
    tenantState.role = "admin";
    tenantState.platformRole = null;
    propertyState.propertyId = "prop-1";
    propertyState.property = { id: "prop-1", name: "Villa Test" };
    propertyState.properties = [{ id: "prop-1", name: "Villa Test" }];
    propertyState.ready = true;
    propertyState.error = null;
  });

  it("shows empty state and creates a website", async () => {
    const user = userEvent.setup();
    getWebsiteBundle.mockResolvedValueOnce(null);
    ensureWebsite.mockResolvedValueOnce({
      website: draftBundle.website,
      draft: draftBundle.draft,
    });

    render(<WebsitePage />);

    expect(
      await screen.findByText("Δεν υπάρχει ιστότοπος"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Villa Test/).length).toBeGreaterThan(0);

    await user.click(screen.getByTestId("website-create-button"));

    await waitFor(() => {
      expect(ensureWebsite).toHaveBeenCalledWith("tenant-1", "prop-1");
    });
    expect(await screen.findByTestId("website-overview-card")).toBeInTheDocument();
    expect(screen.getByTestId("website-draft-card")).toBeInTheDocument();
    expect(screen.getByText(/v1/)).toBeInTheDocument();
  });

  it("renders overview when website exists", async () => {
    getWebsiteBundle.mockResolvedValueOnce(draftBundle);

    render(<WebsitePage />);

    expect(await screen.findByTestId("website-overview-card")).toBeInTheDocument();
    expect(screen.getByText("Μη επιλεγμένο")).toBeInTheDocument();
    expect(screen.getByTestId("website-published-card")).toHaveTextContent(
      /Καμία δημοσίευση/,
    );
  });

  it("shows API error state with retry", async () => {
    const user = userEvent.setup();
    getWebsiteBundle
      .mockRejectedValueOnce(new AdminApiError("FORBIDDEN", "denied", 403))
      .mockResolvedValueOnce(draftBundle);

    render(<WebsitePage />);

    expect(await screen.findByTestId("website-error")).toHaveTextContent(
      /δικαίωμα/,
    );

    await user.click(screen.getByRole("button", { name: /Δοκιμάστε ξανά/i }));
    expect(await screen.findByTestId("website-overview-card")).toBeInTheDocument();
  });

  it("reloads when active property context changes", async () => {
    getWebsiteBundle.mockResolvedValue(null);

    const { rerender } = render(<WebsitePage />);
    await screen.findByText("Δεν υπάρχει ιστότοπος");
    expect(getWebsiteBundle).toHaveBeenCalledWith("tenant-1", "prop-1");

    propertyState.propertyId = "prop-2";
    propertyState.property = { id: "prop-2", name: "Studio B" };
    rerender(<WebsitePage />);

    await waitFor(() => {
      expect(getWebsiteBundle).toHaveBeenCalledWith("tenant-1", "prop-2");
    });
  });

  it("hides create control for roles without website edit permission", async () => {
    tenantState.role = "staff";
    getWebsiteBundle.mockResolvedValueOnce(null);

    render(<WebsitePage />);

    expect(
      await screen.findByText("Δεν υπάρχει ιστότοπος"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("website-create-button")).toBeNull();
    expect(
      screen.getByText(
        /Δεν έχετε δικαίωμα δημιουργίας ιστότοπου για αυτό το κατάλυμα/,
      ),
    ).toBeInTheDocument();
  });

  it("allows managers to create websites for assigned properties", async () => {
    tenantState.role = "manager";
    getWebsiteBundle.mockResolvedValueOnce(null);

    render(<WebsitePage />);

    expect(await screen.findByTestId("website-create-button")).toBeInTheDocument();
  });
});
