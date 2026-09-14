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
import {
  countActiveHolds,
  estimateRevenueFromBookings,
  fetchAllBookings,
  fetchAllProperties,
} from "@/lib/admin/api";
import type { BookingRecord, PropertyRecord } from "@/lib/admin/types";
import { addDays, formatMoney, todayIso } from "@/lib/admin/utils";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/admin/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/admin/status-badge";

export function DashboardOverview() {
  const { tenantId, tenantName, loading: tenantLoading, error: tenantError } = useTenant();
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [activeHolds, setActiveHolds] = useState(0);
  const [revenue, setRevenue] = useState<{ total: number; currency: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantLoading && !tenantId) {
      setLoading(false);
    }
  }, [tenantLoading, tenantId]);

  useEffect(() => {
    setProperties([]);
    setBookings([]);
    setActiveHolds(0);
    setRevenue(null);
    setLoading(true);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;

    let cancelled = false;
    async function load() {
      const isFirstLoad = properties.length === 0;
      if (isFirstLoad) setLoading(true);
      setError(null);
      try {
        const propsRes = await fetchAllProperties(tenantId!, 1, 100);
        if (cancelled) return;
        setProperties(propsRes.data);
        const allBookings = await fetchAllBookings(tenantId!);
        if (cancelled) return;
        const [holds, rev] = await Promise.all([
          countActiveHolds(tenantId!),
          estimateRevenueFromBookings(tenantId!, allBookings),
        ]);
        if (cancelled) return;
        setBookings(allBookings);
        setActiveHolds(holds);
        setRevenue(rev);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load dashboard");
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

  const stats = useMemo(() => {
    const today = todayIso();
    const weekOut = addDays(today, 7);
    const unitCount = properties.reduce((sum, p) => sum + p.units.length, 0);
    const activeBookings = bookings.filter((b) => !["cancelled"].includes(b.status));
    const arrivals = activeBookings.filter((b) => b.checkIn >= today && b.checkIn <= weekOut);
    const departures = activeBookings.filter((b) => b.checkOut >= today && b.checkOut <= weekOut);

    const next30 = addDays(today, 30);
    let bookedNights = 0;
    for (const b of activeBookings) {
      if (b.checkOut <= today || b.checkIn >= next30) continue;
      const start = b.checkIn > today ? b.checkIn : today;
      bookedNights += Math.max(1, Math.round((new Date(b.checkOut).getTime() - new Date(start).getTime()) / 86400000));
    }
    const capacityNights = unitCount * 30;
    const occupancyPct = capacityNights > 0 ? Math.min(100, Math.round((bookedNights / capacityNights) * 100)) : 0;

    return {
      propertyCount: properties.length,
      unitCount,
      bookingCount: activeBookings.length,
      arrivals: arrivals.length,
      departures: departures.length,
      occupancyPct,
    };
  }, [properties, bookings]);

  const recentBookings = bookings.slice(0, 8);
  const recentActivity = useMemo(() => {
    return bookings.slice(0, 5).map((b) => ({
      id: b.id,
      label: `${b.guest.name} · ${b.checkIn} → ${b.checkOut}`,
      status: b.status,
    }));
  }, [bookings]);

  const tenantGate = renderTenantGate({
    loading: tenantLoading,
    error: tenantError,
    tenantId,
  });
  if (tenantGate) return tenantGate;

  if (loading && properties.length === 0 && bookings.length === 0) {
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
        <StatCard icon={Building2} label="Properties" value={stats.propertyCount} />
        <StatCard icon={DoorOpen} label="Units" value={stats.unitCount} />
        <StatCard icon={BookOpen} label="Bookings" value={stats.bookingCount} />
        <StatCard icon={LogIn} label="Arrivals (7d)" value={stats.arrivals} />
        <StatCard icon={LogOut} label="Departures (7d)" value={stats.departures} />
        <StatCard icon={Timer} label="Active holds" value={activeHolds} />
        <StatCard
          icon={DollarSign}
          label="Revenue"
          value={revenue ? formatMoney(revenue.total.toFixed(4), revenue.currency) : "—"}
          hint={revenue ? "From confirmed booking quotes" : "No confirmed bookings"}
        />
        <StatCard icon={Percent} label="Occupancy (30d)" value={`${stats.occupancyPct}%`} hint="Estimated" />
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
                      <p className="font-medium">{booking.guest.name}</p>
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
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-6">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="rounded-md bg-muted p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}
