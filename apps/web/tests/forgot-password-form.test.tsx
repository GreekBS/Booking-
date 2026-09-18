/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

import { ForgotPasswordForm } from "@/features/auth/ForgotPasswordForm";

describe("ForgotPasswordForm", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("posts to /api/auth/password-reset and shows privacy-safe success", async () => {
    const user = userEvent.setup();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });

    render(<ForgotPasswordForm variant="marketing" onBackToLogin={vi.fn()} />);

    await user.type(screen.getByLabelText(/^email$/i), "ada@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "ada@example.com" }),
      });
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "If the account exists, a reset link was sent.",
    );
  });

  it("shows the same generic success regardless of response body", async () => {
    const user = userEvent.setup();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
    });

    render(<ForgotPasswordForm variant="admin" />);
    await user.type(screen.getByPlaceholderText(/^email$/i), "nobody@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByText("If the account exists, a reset link was sent.")).toBeInTheDocument();
  });

  it("blocks duplicate submit while loading", async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: unknown) => void = () => undefined;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(<ForgotPasswordForm variant="marketing" onBackToLogin={vi.fn()} />);
    await user.type(screen.getByLabelText(/^email$/i), "ada@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /sending/i }));
    expect(fetch).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true });
    await screen.findByRole("status");
  });

  it("uses onBackToLogin callback instead of /login when provided", async () => {
    const user = userEvent.setup();
    const onBackToLogin = vi.fn();
    render(<ForgotPasswordForm variant="marketing" onBackToLogin={onBackToLogin} />);

    await user.click(screen.getByRole("button", { name: /back to login/i }));
    expect(onBackToLogin).toHaveBeenCalledTimes(1);
  });

  it("links to /login on standalone when no callback", () => {
    render(<ForgotPasswordForm variant="admin" />);
    expect(screen.getByRole("link", { name: /back to login/i })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
