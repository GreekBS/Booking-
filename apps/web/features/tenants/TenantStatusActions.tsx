"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  tenantId: string;
  status: string;
};

export function TenantStatusActions({ tenantId, status }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "suspend" | "activate") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/platform/v1/tenants/${tenantId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-2">
        {status === "active" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run("suspend")}
            className="text-sm font-medium text-red-700 hover:underline disabled:opacity-50"
          >
            Suspend
          </button>
        ) : status === "suspended" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run("activate")}
            className="text-sm font-medium text-[var(--platform-accent)] hover:underline disabled:opacity-50"
          >
            Reactivate
          </button>
        ) : null}
      </div>
      {error ? <span className="text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
