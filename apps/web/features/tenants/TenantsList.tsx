"use client";

import { useEffect, useState } from "react";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  propertyCount: number;
  createdAt: string;
}

export function TenantsList() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/platform/v1/tenants")
      .then((r) => r.json())
      .then((data) => {
        setTenants(data.data ?? []);
        setLoading(false);
      });
  }, []);

  async function handleImpersonate(tenantId: string) {
    await fetch(`/api/platform/v1/tenants/${tenantId}/impersonate`, {
      method: "POST",
    });
    window.location.href = "/dashboard/properties";
  }

  async function handleSuspend(tenantId: string) {
    await fetch(`/api/platform/v1/tenants/${tenantId}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    window.location.reload();
  }

  if (loading) return <p className="text-sm text-gray-600">Loading...</p>;

  if (tenants.length === 0) {
    return <p className="text-sm text-gray-600">No tenants yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-gray-50">
          <tr>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Slug</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Properties</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => (
            <tr key={tenant.id} className="border-b last:border-0">
              <td className="px-4 py-3">{tenant.name}</td>
              <td className="px-4 py-3 font-mono text-xs">{tenant.slug}</td>
              <td className="px-4 py-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    tenant.status === "active"
                      ? "bg-green-100 text-green-800"
                      : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {tenant.status}
                </span>
              </td>
              <td className="px-4 py-3">{tenant.propertyCount}</td>
              <td className="px-4 py-3 space-x-2">
                <button
                  onClick={() => handleImpersonate(tenant.id)}
                  className="text-blue-600 hover:underline"
                >
                  Open
                </button>
                {tenant.status === "active" && (
                  <button
                    onClick={() => handleSuspend(tenant.id)}
                    className="text-red-600 hover:underline"
                  >
                    Suspend
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
