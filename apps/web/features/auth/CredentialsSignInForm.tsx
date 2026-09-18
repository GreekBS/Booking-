"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { AuthFormVariant } from "./RegisterForm";

type CredentialsSignInFormProps = {
  variant?: AuthFormVariant;
  /** Called after a successful credentials sign-in, before navigation. */
  onSuccess?: () => void;
  /** When set, Create account uses this instead of navigating to `/register`. */
  onCreateAccount?: () => void;
  /** When set, Forgot password uses this instead of navigating to `/forgot-password`. */
  onForgotPassword?: () => void;
  heading?: string;
  description?: string;
  className?: string;
};

/**
 * Single credentials authentication surface for `/login` and marketing modal.
 * Auth.js `signIn` is the only credential submission path — no parallel APIs.
 */
export function CredentialsSignInForm({
  variant = "admin",
  onSuccess,
  onCreateAccount,
  onForgotPassword,
  heading,
  description,
  className,
}: CredentialsSignInFormProps) {
  const router = useRouter();
  const formId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isMarketing = variant === "marketing";
  const title = heading ?? (isMarketing ? "Welcome back" : "HCP Admin");
  const lede =
    description ??
    (isMarketing
      ? "Sign in to manage your hospitality business."
      : "Sign in to your account");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid credentials");
      setLoading(false);
      return;
    }

    onSuccess?.();
    // Preserve existing safe path: land on /dashboard; server layouts apply F.1 SA routing.
    router.push("/dashboard");
    router.refresh();
  }

  async function handleGoogleSignIn() {
    if (loading) return;
    setLoading(true);
    // Preserve existing Google callback behavior exactly.
    await signIn("google", { callbackUrl: "/" });
  }

  const createAccountControl = onCreateAccount ? (
    <button
      type="button"
      onClick={onCreateAccount}
      className={
        isMarketing
          ? "underline underline-offset-4 hover:text-[var(--talos-ink)]"
          : "underline"
      }
    >
      Create account
    </button>
  ) : (
    <Link
      href="/register"
      className={isMarketing ? "underline underline-offset-4 hover:text-[var(--talos-ink)]" : "underline"}
    >
      Create account
    </Link>
  );

  const forgotPasswordControl = onForgotPassword ? (
    <button
      type="button"
      onClick={onForgotPassword}
      className={
        isMarketing
          ? "underline underline-offset-4 hover:text-[var(--talos-ink)]"
          : "underline"
      }
    >
      Forgot password
    </button>
  ) : (
    <Link
      href="/forgot-password"
      className={isMarketing ? "underline underline-offset-4 hover:text-[var(--talos-ink)]" : "underline"}
    >
      Forgot password
    </Link>
  );

  if (isMarketing) {
    return (
      <form id={formId} onSubmit={handleSubmit} className={className ?? "flex flex-col gap-5"}>
        <div>
          <p
            tabIndex={-1}
            data-auth-heading
            className="talos-display text-2xl font-semibold tracking-tight text-[var(--talos-ink)] outline-none"
          >
            {title}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--talos-muted)]">{lede}</p>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-sm border border-[color-mix(in_srgb,var(--talos-copper)_45%,transparent)] bg-[color-mix(in_srgb,var(--talos-copper)_12%,white)] px-3 py-2 text-sm text-[var(--talos-ink-soft)]"
          >
            {error}
          </p>
        ) : null}

        <div>
          <label
            htmlFor={`${formId}-email`}
            className="mb-1.5 block text-sm font-medium text-[var(--talos-ink)]"
          >
            Email
          </label>
          <input
            id={`${formId}-email`}
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-sm border border-[var(--talos-line)] bg-white px-3 py-2.5 text-sm text-[var(--talos-ink)] outline-none focus-visible:border-[var(--talos-forest)]"
            required
            disabled={loading}
          />
        </div>

        <div>
          <label
            htmlFor={`${formId}-password`}
            className="mb-1.5 block text-sm font-medium text-[var(--talos-ink)]"
          >
            Password
          </label>
          <input
            id={`${formId}-password`}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-sm border border-[var(--talos-line)] bg-white px-3 py-2.5 text-sm text-[var(--talos-ink)] outline-none focus-visible:border-[var(--talos-forest)]"
            required
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center rounded-sm bg-[var(--talos-forest)] px-5 py-3 text-sm font-semibold tracking-wide text-[var(--talos-paper)] transition-colors hover:bg-[var(--talos-forest-deep)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="inline-flex w-full items-center justify-center rounded-sm border border-[var(--talos-line)] bg-[var(--talos-paper)] px-5 py-3 text-sm font-semibold text-[var(--talos-ink)] transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-55"
        >
          Continue with Google
        </button>

        <p className="text-center text-sm text-[var(--talos-muted)]">
          {createAccountControl}
          <span aria-hidden className="mx-2">
            ·
          </span>
          {forgotPasswordControl}
        </p>
      </form>
    );
  }

  return (
    <form
      id={formId}
      onSubmit={handleSubmit}
      className={className ?? "w-full max-w-md space-y-4 rounded-lg border bg-white p-8 shadow-sm"}
    >
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-sm text-gray-600">{lede}</p>

      {error ? (
        <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div>
        <label htmlFor={`${formId}-email`} className="mb-1 block text-sm font-medium">
          Email
        </label>
        <input
          id={`${formId}-email`}
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border px-3 py-2"
          required
          disabled={loading}
        />
      </div>

      <div>
        <label htmlFor={`${formId}-password`} className="mb-1 block text-sm font-medium">
          Password
        </label>
        <input
          id={`${formId}-password`}
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border px-3 py-2"
          required
          disabled={loading}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="w-full rounded border px-4 py-2 hover:bg-gray-50 disabled:opacity-50"
      >
        Continue with Google
      </button>

      <p className="text-center text-sm text-gray-600">
        {createAccountControl}
        {" · "}
        {forgotPasswordControl}
      </p>
    </form>
  );
}
