"use client";

import { useEffect, useState } from "react";

interface PropertyRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  type: string;
  units: Array<{ id: string; name: string; maxGuests: number }>;
}

export function PropertiesList() {
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const me = await fetch("/api/admin/v1/me").then((r) => r.json());
      const tid = me.user?.activeTenantId ?? me.memberships?.[0]?.tenantId;
      setTenantId(tid);

      if (!tid) {
        setLoading(false);
        return;
      }

      const res = await fetch("/api/admin/v1/properties", {
        headers: { "X-Tenant-Id": tid },
      });
      const data = await res.json();
      setProperties(data.data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <p className="text-sm text-gray-600">Loading...</p>;

  if (!tenantId) {
    return (
      <p className="text-sm text-gray-600">
        No active tenant. Super admins must impersonate a tenant first.
      </p>
    );
  }

  if (properties.length === 0) {
    return <p className="text-sm text-gray-600">No properties yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-gray-50">
          <tr>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Slug</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Units</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((property) => (
            <tr key={property.id} className="border-b last:border-0">
              <td className="px-4 py-3 font-medium">{property.name}</td>
              <td className="px-4 py-3 font-mono text-xs">{property.slug}</td>
              <td className="px-4 py-3 capitalize">{property.type}</td>
              <td className="px-4 py-3">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">
                  {property.status}
                </span>
              </td>
              <td className="px-4 py-3">{property.units.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
