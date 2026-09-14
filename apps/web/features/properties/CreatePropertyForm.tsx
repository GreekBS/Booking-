"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { invalidatePropertiesCache } from "@/lib/admin/api";

export function CreatePropertyForm() {
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("villa");
  const [maxGuests, setMaxGuests] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/v1/me")
      .then((r) => r.json())
      .then((data) => {
        setTenantId(
          data.user?.activeTenantId ?? data.memberships?.[0]?.tenantId ?? null,
        );
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;

    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/v1/properties", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Tenant-Id": tenantId,
      },
      body: JSON.stringify({ name, type, maxGuests }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error?.message ?? "Failed to create property");
      return;
    }

    invalidatePropertiesCache(tenantId);
    router.push("/dashboard/properties");
    router.refresh();
  }

  if (!tenantId) {
    return (
      <p className="text-sm text-gray-600">
        No active tenant. Impersonate a tenant from Platform Admin first.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-6">
      {error && (
        <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border px-3 py-2"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full rounded border px-3 py-2"
        >
          <option value="villa">Villa</option>
          <option value="apartment">Apartment</option>
          <option value="hotel">Hotel</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Max guests</label>
        <input
          type="number"
          min={1}
          value={maxGuests}
          onChange={(e) => setMaxGuests(Number(e.target.value))}
          className="w-full rounded border px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {loading ? "Creating..." : "Create property"}
      </button>
    </form>
  );
}
