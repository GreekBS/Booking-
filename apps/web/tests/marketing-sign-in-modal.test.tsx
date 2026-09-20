/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("lucide-react", () => ({
  X: (props: Record<string, unknown>) => <svg data-testid="close-icon" {...props} />,
}));

import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFunnelProvider } from "@/components/marketing/MarketingFunnelProvider";

function renderNav() {
  return render(
    <div className="talos-marketing">
      <MarketingFunnelProvider>
        <MarketingNav />
      </MarketingFunnelProvider>
    </div>,
  );
}

describe("MarketingNav sign-in modal", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens dialog from desktop Sign in without changing location", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/pms");

    renderNav();

    await user.click(screen.getByTestId("marketing-sign-in-desktop"));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(window.location.pathname).toBe("/pms");
    expect(within(dialog).getByLabelText(/^email$/i)).toBeInTheDocument();
  });

  it("closes via Escape and close control", async () => {
    const user = userEvent.setup();
    renderNav();

    await user.click(screen.getByTestId("marketing-sign-in-desktop"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await vi.waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    await user.click(screen.getByTestId("marketing-sign-in-desktop"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /close authentication/i }));
    await vi.waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes mobile menu before opening sign-in dialog", async () => {
    const user = userEvent.setup();
    renderNav();

    await user.click(screen.getByRole("button", { name: /open menu/i }));
    expect(screen.getByRole("navigation", { name: /mobile/i })).toBeInTheDocument();

    await user.click(screen.getByTestId("marketing-sign-in-mobile"));

    expect(screen.queryByRole("navigation", { name: /mobile/i })).not.toBeInTheDocument();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("keeps a single dialog instance while open", async () => {
    const user = userEvent.setup();
    renderNav();

    await user.click(screen.getByTestId("marketing-sign-in-desktop"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // Controlled open state — only one dialog root is mounted.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});
