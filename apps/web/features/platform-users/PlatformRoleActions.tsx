"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  userId: string;
  isSuperAdmin: boolean;
  /** Current signed-in platform admin — demote self is allowed only via protected UC. */
  currentUserId: string;
};

export function PlatformRoleActions({
  userId,
  isSuperAdmin,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "promote" | "demote") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/platform/v1/users/${userId}/platform-role`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
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

  const label = isSuperAdmin ? "Demote" : "Promote";
  const action = isSuperAdmin ? "demote" : "promote";
  const isSelf = userId === currentUserId;

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void run(action)}
        className="text-sm font-medium text-[var(--platform-accent)] hover:underline disabled:opacity-50"
        title={
          isSelf && isSuperAdmin
            ? "Demote yourself only if another Super Admin remains"
            : undefined
        }
      >
        {busy ? "Working…" : label}
      </button>
      {error ? <span className="max-w-[14rem] text-xs text-red-700">{error}</span> : null}
    </div>
  );
}
