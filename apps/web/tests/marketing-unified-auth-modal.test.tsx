/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within, waitFor } from "@testing-library/react";
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

describe("Marketing unified auth modal", () => {
  afterEach(() => {
    cleanup();
  });

  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    render(
      <div className="talos-marketing">
        <MarketingNav />
      </div>,
    );
    await user.click(screen.getByTestId("marketing-sign-in-desktop"));
    return screen.findByRole("dialog");
  }

  it("Sign in → Create account stays in one dialog without URL change", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/website-builder");

    const dialog = await openDialog(user);
    expect(window.location.pathname).toBe("/website-builder");

    await user.click(within(dialog).getByRole("button", { name: /create account/i }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(await screen.findByRole("dialog")).getByText(/^create account$/i)).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(window.location.pathname).toBe("/website-builder");
  });

  it("Create account → Sign in stays in the same dialog", async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole("button", { name: /create account/i }));
    const registerDialog = await screen.findByRole("dialog");
    await user.click(within(registerDialog).getByRole("button", { name: /^sign in$/i }));

    const signInDialog = await screen.findByRole("dialog");
    expect(within(signInDialog).getByText(/welcome back/i)).toBeInTheDocument();
    expect(within(signInDialog).getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("Sign in → Forgot password without URL change", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/pms");
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole("button", { name: /forgot password/i }));

    const forgotDialog = await screen.findByRole("dialog");
    expect(within(forgotDialog).getByText(/^reset password$/i)).toBeInTheDocument();
    expect(window.location.pathname).toBe("/pms");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("Forgot password → Sign in stays in the same dialog", async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole("button", { name: /forgot password/i }));
    const forgotDialog = await screen.findByRole("dialog");
    await user.click(within(forgotDialog).getByRole("button", { name: /back to login/i }));

    const signInDialog = await screen.findByRole("dialog");
    expect(within(signInDialog).getByText(/welcome back/i)).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("close → reopen resets to Sign in", async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole("button", { name: /create account/i }));
    expect(within(await screen.findByRole("dialog")).getByText(/^create account$/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /close authentication/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Allow close-reset timeout (200ms) to clear view state.
    await new Promise((r) => setTimeout(r, 250));

    await user.click(screen.getByTestId("marketing-sign-in-desktop"));
    const reopened = await screen.findByRole("dialog");
    expect(within(reopened).getByText(/welcome back/i)).toBeInTheDocument();
    expect(within(reopened).queryByLabelText(/^name$/i)).not.toBeInTheDocument();
  });

  it("closes via Escape and close control", async () => {
    const user = userEvent.setup();
    await openDialog(user);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    await user.click(screen.getByTestId("marketing-sign-in-desktop"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /close authentication/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
