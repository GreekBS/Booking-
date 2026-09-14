"use client";

import { useEffect, useState } from "react";

interface MemberRow {
  id: string;
  role: string;
  status: string;
  user: { email: string; name: string } | null;
}

export function MembersList() {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const me = await fetch("/api/admin/v1/me").then((r) => r.json());
      const tid = me.user?.activeTenantId ?? me.memberships?.[0]?.tenantId;
      setTenantId(tid);
      if (!tid) return;

      const res = await fetch("/api/admin/v1/members", {
        headers: { "X-Tenant-Id": tid },
      });
      const data = await res.json();
      setMembers(data.data ?? []);
    }
    load();
  }, []);

  if (!tenantId) return null;

  return (
    <div className="rounded-lg border bg-white p-4">
      <h2 className="mb-4 font-medium">Current members</h2>
      {members.length === 0 ? (
        <p className="text-sm text-gray-600">No members yet.</p>
      ) : (
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex justify-between text-sm">
              <span>
                {m.user?.name ?? "—"} ({m.user?.email})
              </span>
              <span className="text-gray-500">{m.role}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
