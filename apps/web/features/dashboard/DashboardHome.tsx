"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SignOutButton } from "@/features/auth/SignOutButton";
import { TenantSwitcher } from "@/features/tenants/TenantSwitcher";

interface DashboardStats {
  tenantName: string;
  email: string;
  propertyCount: number;
  unitCount: number;
}

const cards = [
  { title: "Properties", description: "Manage listings and units", href: "/dashboard/properties" },
  { title: "Units", description: "Rooms and accommodation units", href: "/dashboard/properties" },
  { title: "Availability", description: "Calendars and booking rules", href: null },
  { title: "Bookings", description: "Reservations and guest stays", href: null },
  { title: "Pricing", description: "Rates and seasonal pricing", href: null },
  { title: "Members", description: "Team access and invitations", href: "/dashboard/members" },
  { title: "Amenities", description: "Property features and tags", href: null },
  { title: "Settings", description: "Tenant and commerce settings", href: null },
] as const;

export function DashboardHome() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const me = await fetch("/api/admin/v1/me").then((r) => r.json());
      const tenantId = me.user?.activeTenantId ?? me.memberships?.[0]?.tenantId;
      const tenantName = me.memberships?.[0]?.tenantName ?? "Your tenant";

      let propertyCount = 0;
      let unitCount = 0;

      if (tenantId) {
        const res = await fetch("/api/admin/v1/properties", {
          headers: { "X-Tenant-Id": tenantId },
        });
        const data = await res.json();
        const properties = data.data ?? [];
        propertyCount = properties.length;
        unitCount = properties.reduce(
          (sum: number, p: { units: unknown[] }) => sum + (p.units?.length ?? 0),
          0,
        );
      }

      setStats({
        tenantName,
        email: me.user?.email ?? "",
        propertyCount,
        unitCount,
      });
      setLoading(false);
    }
    void load();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-semibold">Tenant Dashboard</h1>
            <p className="text-sm text-gray-600">
              {loading ? "Loading…" : `${stats?.tenantName} · ${stats?.email}`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <TenantSwitcher />
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {!loading && stats && (
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">Properties</p>
              <p className="text-2xl font-semibold">{stats.propertyCount}</p>
            </div>
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="text-sm text-gray-500">Units</p>
              <p className="text-2xl font-semibold">{stats.unitCount}</p>
            </div>
          </div>
        )}

        <h2 className="mb-4 text-lg font-medium">Manage your accommodation</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) =>
            card.href ? (
              <Link
                key={card.title}
                href={card.href}
                className="rounded-lg border bg-white p-5 shadow-sm transition hover:border-gray-400 hover:shadow"
              >
                <h3 className="font-semibold">{card.title}</h3>
                <p className="mt-1 text-sm text-gray-600">{card.description}</p>
              </Link>
            ) : (
              <div
                key={card.title}
                className="rounded-lg border border-dashed bg-white p-5 text-gray-500"
              >
                <h3 className="font-semibold text-gray-800">{card.title}</h3>
                <p className="mt-1 text-sm">{card.description}</p>
                <p className="mt-3 text-xs uppercase tracking-wide">Coming soon</p>
              </div>
            ),
          )}
        </div>
      </main>
    </div>
  );
}
