/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signIn = vi.fn();
const push = vi.fn();
const refresh = vi.fn();

vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
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

import { CredentialsSignInForm } from "@/features/auth/CredentialsSignInForm";

describe("CredentialsSignInForm", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    signIn.mockReset();
    push.mockReset();
    refresh.mockReset();
  });

  it("calls Auth.js credentials signIn and navigates to /dashboard on success", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValue({ error: null, ok: true });
    const onSuccess = vi.fn();

    render(<CredentialsSignInForm variant="admin" onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText(/^email$/i), "owner@demo.local");
    await user.type(screen.getByLabelText(/^password$/i), "Owner123!");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith("credentials", {
        email: "owner@demo.local",
        password: "Owner123!",
        redirect: false,
      });
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/dashboard");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows invalid credentials error and stays on form", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValue({ error: "CredentialsSignin", ok: false });

    render(<CredentialsSignInForm variant="marketing" />);

    await user.type(screen.getByLabelText(/^email$/i), "bad@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "wrong");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid credentials");
    expect(push).not.toHaveBeenCalled();
  });

  it("prevents duplicate submission while loading", async () => {
    const user = userEvent.setup();
    let resolveSignIn: (value: unknown) => void = () => undefined;
    signIn.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }),
    );

    render(<CredentialsSignInForm variant="admin" />);

    await user.type(screen.getByLabelText(/^email$/i), "owner@demo.local");
    await user.type(screen.getByLabelText(/^password$/i), "Owner123!");
    await user.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /signing in/i }));
    expect(signIn).toHaveBeenCalledTimes(1);

    resolveSignIn({ error: null, ok: true });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("preserves Google callbackUrl /", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValue(undefined);

    render(<CredentialsSignInForm variant="admin" />);
    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(signIn).toHaveBeenCalledWith("google", { callbackUrl: "/" });
  });

  it("links Create account and Forgot password by default", () => {
    render(<CredentialsSignInForm variant="marketing" />);
    expect(screen.getByRole("link", { name: /create account/i })).toHaveAttribute(
      "href",
      "/register",
    );
    expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("uses navigation callbacks instead of links when provided", async () => {
    const user = userEvent.setup();
    const onCreateAccount = vi.fn();
    const onForgotPassword = vi.fn();
    render(
      <CredentialsSignInForm
        variant="marketing"
        onCreateAccount={onCreateAccount}
        onForgotPassword={onForgotPassword}
      />,
    );

    await user.click(screen.getByRole("button", { name: /create account/i }));
    await user.click(screen.getByRole("button", { name: /forgot password/i }));
    expect(onCreateAccount).toHaveBeenCalledTimes(1);
    expect(onForgotPassword).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link", { name: /create account/i })).not.toBeInTheDocument();
  });
});
