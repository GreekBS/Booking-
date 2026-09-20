"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { openTenantAsPlatformAdmin } from "./open-tenant";

type Props = {
  tenantId: string;
  /** Defaults to tenant properties list after F.2 open. */
  destinationPath?: string;
  label?: string;
  className?: string;
};

export function OpenTenantButton({
  tenantId,
  destinationPath,
  label = "Open",
  className,
}: Props) {
  const { update } = useSession();
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen() {
    setError(null);
    setOpening(true);
    try {
      const result = await openTenantAsPlatformAdmin({
        tenantId,
        destinationPath,
        impersonate: (id) =>
          fetch(`/api/platform/v1/tenants/${id}/impersonate`, {
            method: "POST",
          }),
        updateSession: (data) => update(data),
        navigate: (url) => {
          window.location.href = url;
        },
      });
      if (!result.ok) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open tenant");
    } finally {
      setOpening(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={opening}
        onClick={() => void handleOpen()}
        className={
          className ??
          "text-sm font-medium text-[var(--platform-accent)] hover:underline disabled:opacity-50"
        }
      >
        {opening ? "Opening…" : label}
      </button>
      {error ? (
        <span className="max-w-xs text-xs text-red-700">{error}</span>
      ) : null}
    </span>
  );
}
