"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { openTenantAsPlatformAdmin } from "./open-tenant";

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  propertyCount: number;
  createdAt: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

export function TenantsList() {
  const { update } = useSession();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/platform/v1/tenants")
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.error?.message ?? `Failed (${r.status})`);
        }
        return r.json();
      })
      .then((data) => {
        setTenants(data.data ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load tenants");
        setLoading(false);
      });
  }, []);

  async function handleImpersonate(tenantId: string) {
    setError(null);
    setOpeningId(tenantId);
    try {
      const result = await openTenantAsPlatformAdmin({
        tenantId,
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
      setOpeningId(null);
    }
  }

  async function handleSuspend(tenantId: string) {
    await fetch(`/api/platform/v1/tenants/${tenantId}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    window.location.reload();
  }

  if (loading) {
    return <p className="text-sm text-[var(--platform-muted)]">Loading...</p>;
  }

  if (error) {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (tenants.length === 0) {
    return (
      <p className="rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)] px-4 py-8 text-center text-sm text-[var(--platform-muted)]">
        No tenants yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-[var(--platform-border)] bg-[var(--platform-card)]">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[var(--platform-border)] bg-[var(--platform-muted-bg)]/60 text-[11px] uppercase tracking-wide text-[var(--platform-muted)]">
          <tr>
            <th className="px-4 py-2.5 font-medium">Name</th>
            <th className="px-4 py-2.5 font-medium">Slug</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Properties</th>
            <th className="hidden px-4 py-2.5 font-medium md:table-cell">
              Created
            </th>
            <th className="px-4 py-2.5 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant) => (
            <tr
              key={tenant.id}
              className="border-b border-[var(--platform-border)] last:border-0"
            >
              <td className="px-4 py-3 font-medium text-[var(--platform-ink)]">
                <Link
                  href={`/platform/tenants/${tenant.id}`}
                  className="hover:text-[var(--platform-accent)] hover:underline"
                >
                  {tenant.name}
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-[var(--platform-muted)]">
                {tenant.slug}
              </td>
              <td className="px-4 py-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${
                    tenant.status === "active"
                      ? "bg-emerald-100 text-emerald-900"
                      : tenant.status === "suspended"
                        ? "bg-amber-100 text-amber-900"
                        : "bg-[var(--platform-muted-bg)] text-[var(--platform-ink-soft)]"
                  }`}
                >
                  {tenant.status}
                </span>
              </td>
              <td className="px-4 py-3 tabular-nums">{tenant.propertyCount}</td>
              <td className="hidden px-4 py-3 text-[var(--platform-muted)] md:table-cell">
                {tenant.createdAt ? formatDate(tenant.createdAt) : "—"}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/platform/tenants/${tenant.id}`}
                    className="text-sm font-medium text-[var(--platform-ink-soft)] hover:underline"
                  >
                    Detail
                  </Link>
                  <button
                    type="button"
                    disabled={openingId !== null}
                    onClick={() => void handleImpersonate(tenant.id)}
                    className="text-sm font-medium text-[var(--platform-accent)] hover:underline disabled:opacity-50"
                  >
                    {openingId === tenant.id ? "Opening…" : "Open"}
                  </button>
                  {tenant.status === "active" ? (
                    <button
                      type="button"
                      onClick={() => void handleSuspend(tenant.id)}
                      className="text-sm font-medium text-red-700 hover:underline"
                    >
                      Suspend
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
