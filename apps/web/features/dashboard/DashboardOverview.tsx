"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  DoorOpen,
  BookOpen,
  LogIn,
  LogOut,
  DollarSign,
  Percent,
  Plus,
  CalendarDays,
  Timer,
} from "lucide-react";
import { renderTenantGate, useTenant } from "@/hooks/use-tenant";
import { fetchDashboardOverview } from "@/lib/admin/api";
import type { DashboardOverviewRecord } from "@/lib/admin/types";
import { formatMoney } from "@/lib/admin/utils";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/admin/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/status-badge";

/**
 * Tenant dashboard home — single overview API (no properties→bookings→quotes waterfall).
 */
export function DashboardOverview() {
  const { tenantId, tenantName, loading: tenantLoading, error: tenantError } = useTenant();
  const [overview, setOverview] = useState<DashboardOverviewRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantLoading && !tenantId) {
      setLoading(false);
      setOverview(null);
    }
  }, [tenantLoading, tenantId]);

  useEffect(() => {
    if (!tenantId) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchDashboardOverview(tenantId!);
        if (!cancelled) setOverview(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard");
          setOverview(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const recentBookings = overview?.recentBookings ?? [];
  const recentActivity = useMemo(
    () =>
      recentBookings.slice(0, 5).map((b) => ({
        id: b.id,
        label: `${b.guestName} · ${b.checkIn} → ${b.checkOut}`,
        status: b.status,
      })),
    [recentBookings],
  );

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;

  if (loading && !overview) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!overview) {
    return <ErrorState message="Dashboard overview unavailable" />;
  }

  const revenue = overview.revenue
    ? {
        total: Number.parseFloat(overview.revenue.total),
        currency: overview.revenue.currency,
      }
    : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description={`Operational overview · ${tenantName}`}
        actions={
          <Button asChild>
            <Link href="/dashboard/properties/new">
              <Plus className="h-4 w-4" />
              New property
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Building2} label="Properties" value={overview.propertyCount} />
        <StatCard icon={DoorOpen} label="Units" value={overview.unitCount} />
        <StatCard icon={BookOpen} label="Bookings" value={overview.bookingCount} />
        <StatCard icon={LogIn} label="Arrivals (7d)" value={overview.arrivalsNext7Days} />
        <StatCard icon={LogOut} label="Departures (7d)" value={overview.departuresNext7Days} />
        <StatCard icon={Timer} label="Active holds" value={overview.activeHoldCount} />
        <StatCard
          icon={DollarSign}
          label="Revenue"
          value={revenue ? formatMoney(revenue.total.toFixed(4), revenue.currency) : "—"}
          hint={revenue ? "From confirmed booking amounts" : "No confirmed bookings"}
        />
        <StatCard
          icon={Percent}
          label="Occupancy (30d)"
          value={`${overview.occupancyPct}%`}
          hint="Estimated"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent bookings</CardTitle>
            <CardDescription>Latest reservations across all units</CardDescription>
          </CardHeader>
          <CardContent>
            {recentBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bookings yet.</p>
            ) : (
              <div className="space-y-3">
                {recentBookings.map((booking) => (
                  <Link
                    key={booking.id}
                    href="/dashboard/bookings"
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 transition hover:bg-muted/50"
                  >
                    <div>
                      <p className="font-medium">{booking.guestName}</p>
                      <p className="text-sm text-muted-foreground">
                        {booking.checkIn} → {booking.checkOut}
                      </p>
                    </div>
                    <StatusBadge status={booking.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                recentActivity.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{item.label}</span>
                    <StatusBadge status={item.status} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="outline" className="justify-start" asChild>
                <Link href="/dashboard/bookings">
                  <BookOpen className="h-4 w-4" />
                  Reservations
                </Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <Link href="/dashboard/availability">
                  <CalendarDays className="h-4 w-4" />
                  Calendar
                </Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <Link href="/dashboard/pricing">
                  <DollarSign className="h-4 w-4" />
                  Pricing
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Building2;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
