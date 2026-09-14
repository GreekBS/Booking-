"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export function TenantSwitcher() {
  const { update } = useSession();
  const [memberships, setMemberships] = useState<
    Array<{ tenantId: string; tenantName: string }>
  >([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/v1/me")
      .then((r) => r.json())
      .then((data) => {
        setMemberships(data.memberships ?? []);
        setActiveTenantId(data.user?.activeTenantId ?? null);
      });
  }, []);

  async function handleChange(tenantId: string) {
    await fetch("/api/admin/v1/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activeTenantId: tenantId }),
    });
    await update({ activeTenantId: tenantId });
    setActiveTenantId(tenantId);
    window.location.reload();
  }

  if (memberships.length <= 1) return null;

  return (
    <select
      value={activeTenantId ?? ""}
      onChange={(e) => handleChange(e.target.value)}
      className="rounded border px-2 py-1 text-sm"
    >
      {memberships.map((m) => (
        <option key={m.tenantId} value={m.tenantId}>
          {m.tenantName}
        </option>
      ))}
    </select>
  );
}

async function getTenantHeader(): Promise<HeadersInit> {
  const me = await fetch("/api/admin/v1/me").then((r) => r.json());
  const tenantId = me.user?.activeTenantId;
  return tenantId ? { "X-Tenant-Id": tenantId } : {};
}

export { getTenantHeader };
