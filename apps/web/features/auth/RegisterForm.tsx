"use client";

import Link from "next/link";
import { useId, useState } from "react";

export type AuthFormVariant = "admin" | "marketing";

type RegisterFormProps = {
  variant?: AuthFormVariant;
  /** When set, "Sign in" uses this instead of navigating to `/login`. */
  onBackToLogin?: () => void;
  className?: string;
  /** Optional prefill from a completed Lead — password is never prefilled. */
  initialName?: string;
  initialEmail?: string;
};

/**
 * Shared registration form for `/register` and the marketing auth modal.
 * Uses existing `POST /api/auth/register` — no parallel registration API.
 */
export function RegisterForm({
  variant = "admin",
  onBackToLogin,
  className,
  initialName = "",
  initialEmail = "",
}: RegisterFormProps) {
  const formId = useId();
  const [email, setEmail] = useState(initialEmail);
  const [name, setName] = useState(initialName);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isMarketing = variant === "marketing";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Registration failed");
        return;
      }

      setMessage("Account created. Check your email to verify.");
      setPassword("");
    } catch {
      setError("Registration failed");
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
      Sign in
    </button>
  ) : (
    <Link href="/login" className={isMarketing ? "underline underline-offset-4" : "underline"}>
      Sign in
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
            Create account
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--talos-muted)]">
            Start configuring your hospitality operation in Talos.
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-sm border border-[color-mix(in_srgb,var(--talos-copper)_45%,transparent)] bg-[color-mix(in_srgb,var(--talos-copper)_12%,white)] px-3 py-2 text-sm text-[var(--talos-ink-soft)]"
          >
            {error}
          </p>
        ) : null}
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
            htmlFor={`${formId}-name`}
            className="mb-1.5 block text-sm font-medium text-[var(--talos-ink)]"
          >
            Name
          </label>
          <input
            id={`${formId}-name`}
            type="text"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-sm border border-[var(--talos-line)] bg-white px-3 py-2.5 text-sm text-[var(--talos-ink)] outline-none focus-visible:border-[var(--talos-forest)]"
            required
            disabled={loading}
          />
        </div>

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
            autoComplete="new-password"
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
          {loading ? "Creating account..." : "Register"}
        </button>

        <p className="text-center text-sm text-[var(--talos-muted)]">
          Already have an account? {backControl}
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
      <h1 className="text-2xl font-semibold">Create account</h1>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      <input
        type="text"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded border px-3 py-2"
        required
        disabled={loading}
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded border px-3 py-2"
        required
        disabled={loading}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded border px-3 py-2"
        required
        disabled={loading}
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "Creating account..." : "Register"}
      </button>
      <p className="text-center text-sm">
        Already have an account? {backControl}
      </p>
    </form>
  );
}
