"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CalendarDays,
  LogIn,
  LogOut,
  Users,
  Timer,
  Plus,
  Wallet,
  Network,
  Percent,
  DollarSign,
  ArrowRight,
  ClipboardList,
  Sparkles,
} from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { fetchDashboardOverview, fetchHousekeepingToday } from "@/lib/admin/api";
import type {
  DashboardOverviewRecentBooking,
  DashboardOverviewRecord,
  HousekeepingTodayBoard,
} from "@/lib/admin/types";
import { formatMoney } from "@/lib/admin/utils";
import { PageHeader } from "@/components/admin/page-header";
import { ErrorState } from "@/components/admin/error-state";
import { EmptyState } from "@/components/admin/empty-state";
import { Surface, SurfaceHeader } from "@/components/admin/surface";
import { StatusBadge } from "@/components/admin/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatOpsDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${iso}T12:00:00`));
  } catch {
    return iso;
  }
}

function todayIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Operational hospitality dashboard — property-scoped via Active Property.
 * Single overview fetch (no quote fan-out).
 */
export function DashboardOverview() {
  const { tenantId, tenantName, loading: tenantLoading, error: tenantError } = useTenant();
  const {
    propertyId,
    property,
    properties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();
  const [overview, setOverview] = useState<DashboardOverviewRecord | null>(null);
  const [housekeeping, setHousekeeping] = useState<HousekeepingTodayBoard | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const [data, hk] = await Promise.all([
        fetchDashboardOverview(tenantId, propertyId),
        fetchHousekeepingToday(tenantId, propertyId).catch(() => null),
      ]);
      setOverview(data);
      setHousekeeping(hk);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
      setOverview(null);
      setHousekeeping(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId]);

  useEffect(() => {
    if (!tenantLoading && !tenantId) {
      setLoading(false);
      setOverview(null);
      setHousekeeping(null);
    }
  }, [tenantLoading, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const todayLabel = useMemo(() => formatOpsDate(todayIsoLocal()), []);

  const propertyGate = renderActivePropertyGate({
    tenantLoading,
    tenantError,
    tenantId,
    propertyReady,
    propertyError,
    propertyId,
    properties,
  });
  if (propertyGate) return propertyGate;

  if (loading && !overview) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }

  if (!overview) {
    return <ErrorState message="Dashboard overview unavailable" onRetry={() => void load()} />;
  }

  const revenue = overview.revenue
    ? {
        total: Number.parseFloat(overview.revenue.total),
        currency: overview.revenue.currency,
      }
    : null;

  const attentionItems = buildAttention(overview, housekeeping);

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        title="Operations"
        description={
          property
            ? `${property.name} · ${housekeeping?.localToday ? formatOpsDate(housekeeping.localToday) : todayLabel}`
            : `${tenantName} · ${todayLabel}`
        }
        actions={
          <Button asChild size="sm">
            <Link href="/dashboard/bookings/new">
              <Plus className="h-4 w-4" />
              New booking
            </Link>
          </Button>
        }
      />

      {/* Primary metrics — hierarchy, not equal wall */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Occupancy (30d)"
          value={`${overview.occupancyPct}%`}
          hint="Estimated"
          icon={Percent}
          emphasis
        />
        <MetricCard
          label="Revenue"
          value={revenue ? formatMoney(revenue.total.toFixed(4), revenue.currency) : "—"}
          hint={revenue ? "Confirmed & completed" : "No confirmed bookings"}
          icon={DollarSign}
        />
        <MetricCard
          label="Bookings"
          value={overview.bookingCount}
          hint={`${overview.unitCount} units`}
          icon={BookOpen}
        />
        <MetricCard
          label="Active holds"
          value={overview.activeHoldCount}
          hint="Open inventory holds"
          icon={Timer}
        />
      </div>

      {/* Today board */}
      <Surface variant="panel" padding="md">
        <SurfaceHeader
          title="Today"
          description={
            housekeeping
              ? `What needs attention · ${housekeeping.propertyTimezone}`
              : "What needs attention at this property"
          }
          action={
            <Button variant="ghost" size="sm" asChild className="h-8 text-xs">
              <Link href="/dashboard/availability">
                Calendar
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <TodayStat
            icon={LogIn}
            label="Arrivals"
            value={overview.arrivalsToday}
            tone="info"
          />
          <TodayStat
            icon={LogOut}
            label="Departures"
            value={overview.departuresToday}
            tone="warning"
          />
          <TodayStat
            icon={Users}
            label="In-house"
            value={overview.inHouseToday}
            tone="success"
          />
          <TodayStat
            icon={CalendarDays}
            label="Next 7 days"
            value={overview.arrivalsNext7Days + overview.departuresNext7Days}
            hint={`${overview.arrivalsNext7Days} in · ${overview.departuresNext7Days} out`}
            tone="muted"
          />
        </div>

        {housekeeping ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
            <HousekeepingSignal
              label="Dirty"
              value={housekeeping.summary.dirty}
              href="/dashboard/housekeeping?view=today"
            />
            <HousekeepingSignal
              label="In progress"
              value={housekeeping.summary.inProgress}
              href="/dashboard/housekeeping?view=today"
            />
            <HousekeepingSignal
              label="Overdue tasks"
              value={housekeeping.summary.overdueTasks}
              href="/dashboard/housekeeping?view=all&status=OPEN"
            />
            <HousekeepingSignal
              label="Ready for arrivals"
              value={housekeeping.summary.readyForArrivals}
              href="/dashboard/housekeeping?view=today"
            />
            <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
              <Link href="/dashboard/housekeeping">
                Housekeeping
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <StayList
            title="Arriving today"
            empty="No arrivals today."
            items={overview.todayArrivals}
          />
          <StayList
            title="Departing today"
            empty="No departures today."
            items={overview.todayDepartures}
          />
        </div>
      </Surface>

      <div className="grid gap-4 lg:grid-cols-3">
        <Surface variant="panel" padding="md" className="lg:col-span-2">
          <SurfaceHeader
            title="Recent reservations"
            description="Latest bookings for the active property"
            action={
              <Button variant="ghost" size="sm" asChild className="h-8 text-xs">
                <Link href="/dashboard/bookings">View all</Link>
              </Button>
            }
          />
          {overview.recentBookings.length === 0 ? (
            <EmptyState
              compact
              title="No bookings yet"
              description="Create a manual booking or wait for channel reservations."
              action={{ label: "New booking", href: "/dashboard/bookings/new" }}
            />
          ) : (
            <ul className="divide-y divide-border">
              {overview.recentBookings.map((booking) => (
                <li key={booking.id}>
                  <Link
                    href={`/dashboard/bookings?bookingId=${encodeURIComponent(booking.id)}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 transition-colors hover:bg-surface-subtle/80 -mx-1 px-1 rounded-md"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{booking.guestName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {booking.checkIn} → {booking.checkOut}
                        {booking.unitName ? ` · ${booking.unitName}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs font-medium tabular-nums text-foreground">
                        {formatMoney(booking.totalAmount, booking.currency)}
                      </span>
                      <StatusBadge status={booking.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Surface>

        <div className="space-y-4">
          <Surface variant={attentionItems.length > 0 ? "attention" : "subtle"} padding="md">
            <SurfaceHeader title="Attention" description="Signals from current data" />
            {attentionItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No operational alerts from available data.
              </p>
            ) : (
              <ul className="space-y-2">
                {attentionItems.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      className="flex items-start justify-between gap-2 rounded-md border border-border/60 bg-surface px-2.5 py-2 text-sm transition-colors hover:bg-surface-subtle"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                      <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Surface>

          <Surface variant="panel" padding="md">
            <SurfaceHeader title="Quick actions" />
            <div className="grid grid-cols-2 gap-2">
              <QuickAction href="/dashboard/bookings/new" icon={Plus} label="New booking" />
              <QuickAction href="/dashboard/availability" icon={CalendarDays} label="Calendar" />
              <QuickAction href="/dashboard/housekeeping" icon={ClipboardList} label="Housekeeping" />
              <QuickAction href="/dashboard/payments" icon={Wallet} label="Payments" />
              <QuickAction href="/dashboard/channels" icon={Network} label="Channels" />
              <QuickAction href="/dashboard/pricing" icon={Sparkles} label="Pricing" />
            </div>
          </Surface>
        </div>
      </div>
    </div>
  );
}

function buildAttention(
  overview: DashboardOverviewRecord,
  housekeeping: HousekeepingTodayBoard | null,
): Array<{
  id: string;
  title: string;
  detail: string;
  href: string;
}> {
  const items: Array<{ id: string; title: string; detail: string; href: string }> = [];
  if (housekeeping && housekeeping.summary.dirty > 0) {
    items.push({
      id: "hk-dirty",
      title: `${housekeeping.summary.dirty} dirty unit${housekeeping.summary.dirty === 1 ? "" : "s"}`,
      detail: "Turnover / cleaning still needed",
      href: "/dashboard/housekeeping?view=today",
    });
  }
  if (housekeeping && housekeeping.summary.overdueTasks > 0) {
    items.push({
      id: "hk-overdue",
      title: `${housekeeping.summary.overdueTasks} overdue task${housekeeping.summary.overdueTasks === 1 ? "" : "s"}`,
      detail: "Open work past due",
      href: "/dashboard/housekeeping?view=all&status=OPEN",
    });
  }
  if (overview.activeHoldCount > 0) {
    items.push({
      id: "holds",
      title: `${overview.activeHoldCount} active hold${overview.activeHoldCount === 1 ? "" : "s"}`,
      detail: "Review open inventory holds on the calendar",
      href: "/dashboard/availability",
    });
  }
  if (overview.arrivalsToday > 0) {
    items.push({
      id: "arrivals",
      title: `${overview.arrivalsToday} arrival${overview.arrivalsToday === 1 ? "" : "s"} today`,
      detail: "Prepare units and guest check-in",
      href: "/dashboard/bookings",
    });
  }
  if (overview.departuresToday > 0) {
    items.push({
      id: "departures",
      title: `${overview.departuresToday} departure${overview.departuresToday === 1 ? "" : "s"} today`,
      detail: "Coordinate checkout and turnover",
      href: "/dashboard/housekeeping?view=today",
    });
  }
  return items;
}

function HousekeepingSignal({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border/70 bg-surface px-2.5 py-1 text-xs transition-colors hover:bg-surface-subtle"
      aria-label={`${label}: ${value}`}
    >
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums text-foreground">{value}</span>
    </Link>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  emphasis,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof BookOpen;
  emphasis?: boolean;
}) {
  return (
    <Surface
      variant={emphasis ? "raised" : "metric"}
      padding="sm"
      className={cn(emphasis && "ring-1 ring-primary/15")}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </Surface>
  );
}

function TodayStat({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof LogIn;
  label: string;
  value: number;
  hint?: string;
  tone: "info" | "warning" | "success" | "muted";
}) {
  const toneIcon = {
    info: "text-info bg-info-subtle",
    warning: "text-warning-foreground bg-warning-subtle",
    success: "text-success bg-success-subtle",
    muted: "text-muted-foreground bg-muted",
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/70 bg-surface-subtle/40 px-3 py-2.5">
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-md", toneIcon)}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </p>
        <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
        {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

function StayList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: DashboardOverviewRecentBooking[];
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-foreground">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((b) => (
            <li key={b.id}>
              <Link
                href={`/dashboard/bookings?bookingId=${encodeURIComponent(b.id)}`}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-surface px-2.5 py-2 text-sm transition-colors hover:bg-surface-subtle"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{b.guestName}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {b.unitName ?? "Unit"} · {b.checkIn} → {b.checkOut}
                  </p>
                </div>
                <StatusBadge status={b.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Plus;
  label: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      asChild
      className="h-auto justify-start gap-2 border-border bg-surface px-2.5 py-2 text-xs font-medium shadow-none hover:bg-surface-subtle"
    >
      <Link href={href}>
        <Icon className="h-3.5 w-3.5 text-primary" />
        {label}
      </Link>
    </Button>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-lg" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-lg lg:col-span-2" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}
