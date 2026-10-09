/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const refreshActiveProperty = vi.fn(async () => undefined);
const invalidatePropertiesCache = vi.fn();
const adminFetch = vi.fn();
const push = vi.fn();
const routerRefresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: routerRefresh }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-tenant", () => ({
  useTenant: () => ({
    tenantId: "tenant-1",
    profile: {
      user: {
        id: "u1",
        email: "admin@example.com",
        name: "Admin",
        platformRole: null,
        emailVerified: null,
      },
      memberships: [
        {
          id: "m1",
          tenantId: "tenant-1",
          tenantName: "Tenant",
          tenantSlug: "tenant",
          role: "admin",
          propertyIds: null,
          status: "active",
        },
      ],
      activeTenantId: "tenant-1",
    },
    loading: false,
    error: null,
  }),
  renderTenantGate: () => null,
}));

vi.mock("@/hooks/use-active-property", () => ({
  useActiveProperty: () => ({
    refresh: refreshActiveProperty,
    propertyId: null,
    property: null,
    properties: [],
    setActiveProperty: vi.fn(),
    ready: true,
    error: null,
  }),
}));

vi.mock("@/lib/admin/api", () => ({
  adminFetch: (...args: unknown[]) => adminFetch(...args),
  invalidatePropertiesCache: (...args: unknown[]) =>
    invalidatePropertiesCache(...args),
}));

import { CreatePropertyPage } from "@/features/properties/CreatePropertyPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CreatePropertyPage → Active Property refresh", () => {
  it("invalidates caches, refreshes provider with preferred id, then navigates", async () => {
    const user = userEvent.setup();
    adminFetch.mockResolvedValueOnce({
      id: "prop-new",
      name: "New Villa",
      type: "villa",
      status: "draft",
    });

    render(<CreatePropertyPage />);
    await user.type(screen.getByLabelText("Όνομα"), "New Villa");
    await user.click(screen.getByRole("button", { name: /Δημιουργία καταλύματος/i }));

    await waitFor(() => {
      expect(invalidatePropertiesCache).toHaveBeenCalledWith("tenant-1");
      expect(refreshActiveProperty).toHaveBeenCalledWith({
        preferredPropertyId: "prop-new",
      });
      expect(push).toHaveBeenCalledWith("/dashboard/properties/prop-new");
    });
  });
});
