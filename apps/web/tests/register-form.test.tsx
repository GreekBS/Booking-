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

import { RegisterForm } from "@/features/auth/RegisterForm";

describe("RegisterForm", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(),
    );
  });

  it("posts to /api/auth/register and shows success without auto-login", async () => {
    const user = userEvent.setup();
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    render(<RegisterForm variant="marketing" onBackToLogin={vi.fn()} />);

    await user.type(screen.getByLabelText(/^name$/i), "Ada");
    await user.type(screen.getByLabelText(/^email$/i), "ada@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "Secret123!");
    await user.click(screen.getByRole("button", { name: /^register$/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "ada@example.com",
          name: "Ada",
          password: "Secret123!",
        }),
      });
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Account created. Check your email to verify.",
    );
    expect(screen.getByLabelText(/^password$/i)).toHaveValue("");
  });

  it("maps API errors and blocks duplicate submit while loading", async () => {
    const user = userEvent.setup();
    let resolveFetch: (value: unknown) => void = () => undefined;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(<RegisterForm variant="admin" />);

    await user.type(screen.getByPlaceholderText(/^name$/i), "Ada");
    await user.type(screen.getByPlaceholderText(/^email$/i), "ada@example.com");
    await user.type(screen.getByPlaceholderText(/^password$/i), "Secret123!");
    await user.click(screen.getByRole("button", { name: /^register$/i }));

    expect(screen.getByRole("button", { name: /creating account/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /creating account/i }));
    expect(fetch).toHaveBeenCalledTimes(1);

    resolveFetch({
      ok: false,
      json: async () => ({ error: { message: "Email already registered" } }),
    });
    expect(await screen.findByText("Email already registered")).toBeInTheDocument();
  });

  it("uses onBackToLogin callback instead of /login when provided", async () => {
    const user = userEvent.setup();
    const onBackToLogin = vi.fn();
    render(<RegisterForm variant="marketing" onBackToLogin={onBackToLogin} />);

    await user.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(onBackToLogin).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link", { name: /^sign in$/i })).not.toBeInTheDocument();
  });

  it("links to /login on standalone when no callback", () => {
    render(<RegisterForm variant="admin" />);
    expect(screen.getByRole("link", { name: /^sign in$/i })).toHaveAttribute("href", "/login");
  });
});
