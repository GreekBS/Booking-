"use client";

import Link from "next/link";
import { useId, useState } from "react";
import type { AuthFormVariant } from "./RegisterForm";

type ForgotPasswordFormProps = {
  variant?: AuthFormVariant;
  /** When set, "Back to login" / Sign in uses this instead of `/login`. */
  onBackToLogin?: () => void;
  className?: string;
};

/**
 * Shared password-reset request form for `/forgot-password` and marketing modal.
 * Uses existing `POST /api/auth/password-reset` with the same privacy-safe success copy.
 */
export function ForgotPasswordForm({
  variant = "admin",
  onBackToLogin,
  className,
}: ForgotPasswordFormProps) {
  const formId = useId();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isMarketing = variant === "marketing";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    try {
      await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Preserve intentional generic response (no account enumeration).
      setMessage("If the account exists, a reset link was sent.");
    } finally {
      setLoading(false);
    }
  }

  const backControl = onBackToLogin ? (
    <button
      type="button"
      onClick={onBackToLogin}
      className={
        isMarketing
          ? "underline underline-offset-4 hover:text-[var(--talos-ink)]"
          : "underline"
      }
    >
      Back to login
    </button>
  ) : (
    <Link href="/login" className={isMarketing ? "underline underline-offset-4" : "underline"}>
      Back to login
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
            Reset password
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--talos-muted)]">
            Enter your email and we will send reset instructions if an account exists.
          </p>
        </div>

        {message ? (
          <p
            role="status"
            className="rounded-sm border border-[color-mix(in_srgb,var(--talos-forest)_35%,transparent)] bg-[color-mix(in_srgb,var(--talos-forest)_10%,white)] px-3 py-2 text-sm text-[var(--talos-ink-soft)]"
          >
            {message}
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

        <button
          type="submit"
          disabled={loading}
          className="inline-flex w-full items-center justify-center rounded-sm bg-[var(--talos-forest)] px-5 py-3 text-sm font-semibold tracking-wide text-[var(--talos-paper)] transition-colors hover:bg-[var(--talos-forest-deep)] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {loading ? "Sending..." : "Send reset link"}
        </button>

        <p className="text-center text-sm text-[var(--talos-muted)]">{backControl}</p>
      </form>
    );
  }

  return (
    <form
      id={formId}
      onSubmit={handleSubmit}
      className={className ?? "w-full max-w-md space-y-4 rounded-lg border bg-white p-8 shadow-sm"}
    >
      <h1 className="text-2xl font-semibold">Reset password</h1>
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded border px-3 py-2"
        required
        disabled={loading}
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "Sending..." : "Send reset link"}
      </button>
      <p className="text-center text-sm">{backControl}</p>
    </form>
  );
}
