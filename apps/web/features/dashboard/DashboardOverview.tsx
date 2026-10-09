"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  Moon,
} from "lucide-react";
import { useTenant } from "@/hooks/use-tenant";
import {
  renderActivePropertyGate,
  useActiveProperty,
} from "@/hooks/use-active-property";
import { fetchDashboardOverview, fetchHousekeepingToday } from "@/lib/admin/api";
import { canCreateProperty } from "@/lib/admin/can-create-property";
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
import { elCommon, elNav, elStatus } from "@/lib/i18n";
import {
  analyticsPeriodToSearchParams,
  type AnalyticsPeriodWindow,
} from "@hcp/domain";
import {
  DashboardPeriodControl,
  hasAnalyticsPeriodParams,
  periodQueryFromSearchParams,
} from "./DashboardPeriodControl";

function formatOpsDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("el-GR", {
      weekday: "long",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(`${iso}T12:00:00`));
  } catch {
    return iso;
  }
}

/**
 * Operational hospitality dashboard — property-scoped via Active Property.
 * Analytics period via URL params; default Year (property-local).
 */
export function DashboardOverview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    tenantId,
    tenantName,
    profile,
    loading: tenantLoading,
    error: tenantError,
  } = useTenant();
  const {
    propertyId,
    property,
    properties,
    ready: propertyReady,
    error: propertyError,
  } = useActiveProperty();
  const allowCreateProperty = canCreateProperty(profile, tenantId);
  const [overview, setOverview] = useState<DashboardOverviewRecord | null>(null);
  const [housekeeping, setHousekeeping] = useState<HousekeepingTodayBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const periodQuery = useMemo(
    () => periodQueryFromSearchParams(searchParams),
    [searchParams],
  );

  const load = useCallback(async () => {
    if (!tenantId || !propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const [data, hk] = await Promise.all([
        fetchDashboardOverview(tenantId, propertyId, periodQuery),
        fetchHousekeepingToday(tenantId, propertyId).catch(() => null),
      ]);
      setOverview(data);
      setHousekeeping(hk);
      if (!hasAnalyticsPeriodParams(searchParams)) {
        const params = analyticsPeriodToSearchParams(data.periodAnalytics.period);
        router.replace(`/dashboard?${params.toString()}`, { scroll: false });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Αποτυχία φόρτωσης πίνακα ελέγχου");
      setOverview(null);
      setHousekeeping(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, propertyId, periodQuery, router, searchParams]);

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

  const todayLabel = useMemo(() => {
    const iso = overview?.localToday ?? housekeeping?.localToday;
    return iso ? formatOpsDate(iso) : "";
  }, [overview?.localToday, housekeeping?.localToday]);

  function onPeriodChange(next: AnalyticsPeriodWindow) {
    const params = analyticsPeriodToSearchParams(next);
    router.push(`/dashboard?${params.toString()}`, { scroll: false });
  }

  if (
    !tenantLoading &&
    propertyReady &&
    tenantId &&
    !tenantError &&
    !propertyError &&
    properties.length === 0
  ) {
    return (
      <div className="space-y-5 md:space-y-6">
        <PageHeader
          title={elNav.operations}
          description={
            tenantName
              ? `${tenantName} · Δημιουργήστε το πρώτο σας κατάλυμα για να ξεκινήσετε`
              : "Δημιουργήστε το πρώτο σας κατάλυμα για να ξεκινήσετε"
          }
        />
        <EmptyState
          title="Καλώς ήρθατε στο Talos"
          description={
            allowCreateProperty
              ? "Ο οργανισμός σας είναι έτοιμος. Το επόμενο βήμα είναι να δημιουργήσετε το πρώτο σας κατάλυμα — για τιμές, διαθεσιμότητα και κρατήσεις."
              : "Δεν υπάρχουν προσβάσιμα καταλύματα. Ζητήστε από διαχειριστή οργανισμού να δημιουργήσει κατάλυμα ή να σας το αναθέσει."
          }
          action={
            allowCreateProperty
              ? {
                  label: "Δημιουργήστε το πρώτο σας κατάλυμα",
                  href: "/dashboard/properties/new",
                }
              : undefined
          }
        />
      </div>
    );
  }

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
    return (
      <ErrorState
        message="Η επισκόπηση πίνακα ελέγχου δεν είναι διαθέσιμη"
        onRetry={() => void load()}
      />
    );
  }

  const analytics = overview.periodAnalytics;
  const revenue = analytics.revenue
    ? {
        total: Number.parseFloat(analytics.revenue.total),
        currency: analytics.revenue.currency,
      }
    : null;
  const adr = analytics.adr
    ? {
        amount: Number.parseFloat(analytics.adr.amount),
        currency: analytics.adr.currency,
      }
    : null;

  const attentionItems = buildAttention(overview, housekeeping);
  const period = analytics.period;

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        title={elNav.operations}
        description={
          property
            ? `${property.name} · ${todayLabel || formatOpsDate(overview.localToday)}`
            : `${tenantName} · ${todayLabel}`
        }
        actions={
          <Button asChild size="sm">
            <Link href="/dashboard/bookings/new">
              <Plus className="h-4 w-4" />
              Νέα κράτηση
            </Link>
          </Button>
        }
      />

      <Surface variant="panel" padding="md" className="space-y-4">
        <SurfaceHeader
          title="Ανάλυση περιόδου"
          description="Ημερολογιακή περίοδος για έσοδα, κρατήσεις και πληρότητα"
        />
        <DashboardPeriodControl
          period={period}
          localToday={overview.localToday}
          onChange={onPeriodChange}
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label={elNav.revenue}
            value={
              revenue
                ? formatMoney(revenue.total.toFixed(4), revenue.currency)
                : "€0,00"
            }
            hint={`${period.displayLabel} · Επιβεβαιωμένες & ολοκληρωμένες`}
            icon={DollarSign}
            emphasis
          />
          <MetricCard
            label={elCommon.bookings}
            value={analytics.bookingCount}
            hint="Διαμονές στην περίοδο"
            icon={BookOpen}
          />
          <MetricCard
            label="Διανυκτερεύσεις"
            value={analytics.occupiedNights}
            hint="Πωλημένες νύχτες στην περίοδο"
            icon={Moon}
          />
          <MetricCard
            label="Πληρότητα"
            value={`${analytics.occupancyPct}%`}
            hint={`Πλήρες ημερολογιακό διάστημα · ${analytics.capacityNights} νύχτες χωρητικότητας`}
            icon={Percent}
          />
          <MetricCard
            label="ADR"
            value={adr ? formatMoney(adr.amount.toFixed(4), adr.currency) : "—"}
            hint={
              analytics.occupiedNights > 0
                ? "Έσοδα / διανυκτερεύσεις"
                : "Χωρίς διανυκτερεύσεις"
            }
            icon={DollarSign}
          />
        </div>
      </Surface>

      <Surface variant="panel" padding="md">
        <SurfaceHeader
          title={elCommon.today}
          description={
            overview.propertyTimezone
              ? `Λειτουργικά σήμερα · ${overview.propertyTimezone}`
              : "Τι χρειάζεται προσοχή στο κατάλυμα"
          }
          action={
            <Button variant="ghost" size="sm" asChild className="h-8 text-xs">
              <Link href="/dashboard/availability">
                {elNav.availability}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <TodayStat icon={LogIn} label="Αφίξεις" value={overview.arrivalsToday} tone="info" />
          <TodayStat
            icon={LogOut}
            label="Αναχωρήσεις"
            value={overview.departuresToday}
            tone="warning"
          />
          <TodayStat
            icon={Users}
            label="Στο κατάλυμα"
            value={overview.inHouseToday}
            tone="success"
          />
          <TodayStat
            icon={CalendarDays}
            label="Επόμενες 7 ημέρες"
            value={overview.arrivalsNext7Days + overview.departuresNext7Days}
            hint={`${overview.arrivalsNext7Days} είσ. · ${overview.departuresNext7Days} εξ.`}
            tone="muted"
          />
        </div>

        {housekeeping ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
            <HousekeepingSignal
              label={elStatus.DIRTY ?? "Βρώμικα"}
              value={housekeeping.summary.dirty}
              href="/dashboard/housekeeping?view=today"
            />
            <HousekeepingSignal
              label={elStatus.IN_PROGRESS ?? "Σε εξέλιξη"}
              value={housekeeping.summary.inProgress}
              href="/dashboard/housekeeping?view=today"
            />
            <HousekeepingSignal
              label="Εκπρόθεσμες εργασίες"
              value={housekeeping.summary.overdueTasks}
              href="/dashboard/housekeeping?view=all&status=OPEN"
            />
            <HousekeepingSignal
              label="Έτοιμα για αφίξεις"
              value={housekeeping.summary.readyForArrivals}
              href="/dashboard/housekeeping?view=today"
            />
            <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
              <Link href="/dashboard/housekeeping">
                {elNav.housekeeping}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border/60 pt-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Timer className="h-3.5 w-3.5" />
            Ενεργές δεσμεύσεις:{" "}
            <strong className="text-foreground">{overview.activeHoldCount}</strong>
          </span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <StayList
            title="Αφίξεις σήμερα"
            empty="Δεν υπάρχουν αφίξεις σήμερα."
            items={overview.todayArrivals}
          />
          <StayList
            title="Αναχωρήσεις σήμερα"
            empty="Δεν υπάρχουν αναχωρήσεις σήμερα."
            items={overview.todayDepartures}
          />
        </div>
      </Surface>

      <div className="grid gap-4 lg:grid-cols-3">
        <Surface variant="panel" padding="md" className="lg:col-span-2">
          <SurfaceHeader
            title="Πρόσφατες κρατήσεις"
            description="Τελευταίες κρατήσεις για το ενεργό κατάλυμα"
            action={
              <Button variant="ghost" size="sm" asChild className="h-8 text-xs">
                <Link href="/dashboard/bookings">{elCommon.viewAll}</Link>
              </Button>
            }
          />
          {overview.recentBookings.length === 0 ? (
            <EmptyState
              compact
              title="Δεν υπάρχουν κρατήσεις ακόμα"
              description="Δημιουργήστε χειροκίνητη κράτηση ή περιμένετε κρατήσεις από κανάλια."
              action={{ label: "Νέα κράτηση", href: "/dashboard/bookings/new" }}
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
            <SurfaceHeader
              title="Προσοχή"
              description="Ενδείξεις από τα τρέχοντα δεδομένα"
            />
            {attentionItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Δεν υπάρχουν λειτουργικές ειδοποιήσεις από τα διαθέσιμα δεδομένα.
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
            <SurfaceHeader title="Γρήγορες ενέργειες" />
            <div className="grid grid-cols-2 gap-2">
              <QuickAction href="/dashboard/bookings/new" icon={Plus} label="Νέα κράτηση" />
              <QuickAction
                href="/dashboard/availability"
                icon={CalendarDays}
                label={elNav.availability}
              />
              <QuickAction
                href="/dashboard/housekeeping"
                icon={ClipboardList}
                label={elNav.housekeeping}
              />
              <QuickAction href="/dashboard/payments" icon={Wallet} label={elNav.payments} />
              <QuickAction href="/dashboard/channels" icon={Network} label={elNav.channels} />
              <QuickAction href="/dashboard/pricing" icon={Sparkles} label={elNav.pricing} />
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
    const n = housekeeping.summary.dirty;
    items.push({
      id: "hk-dirty",
      title: n === 1 ? "1 βρώμικη μονάδα" : `${n} βρώμικες μονάδες`,
      detail: "Απαιτείται αλλαγή / καθαριότητα",
      href: "/dashboard/housekeeping?view=today",
    });
  }
  if (housekeeping && housekeeping.summary.overdueTasks > 0) {
    const n = housekeeping.summary.overdueTasks;
    items.push({
      id: "hk-overdue",
      title: n === 1 ? "1 εκπρόθεσμη εργασία" : `${n} εκπρόθεσμες εργασίες`,
      detail: "Ανοιχτές εργασίες με ληξιπρόθεσμη προθεσμία",
      href: "/dashboard/housekeeping?view=all&status=OPEN",
    });
  }
  if (overview.activeHoldCount > 0) {
    const n = overview.activeHoldCount;
    items.push({
      id: "holds",
      title: n === 1 ? "1 ενεργή δέσμευση" : `${n} ενεργές δεσμεύσεις`,
      detail: "Ελέγξτε τις ανοιχτές δεσμεύσεις στο ημερολόγιο",
      href: "/dashboard/availability",
    });
  }
  if (overview.arrivalsToday > 0) {
    const n = overview.arrivalsToday;
    items.push({
      id: "arrivals",
      title: n === 1 ? "1 άφιξη σήμερα" : `${n} αφίξεις σήμερα`,
      detail: "Προετοιμασία μονάδων και check-in επισκεπτών",
      href: "/dashboard/bookings",
    });
  }
  if (overview.departuresToday > 0) {
    const n = overview.departuresToday;
    items.push({
      id: "departures",
      title: n === 1 ? "1 αναχώρηση σήμερα" : `${n} αναχωρήσεις σήμερα`,
      detail: "Συντονισμός check-out και αλλαγής",
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
                    {b.unitName ?? elCommon.unit} · {b.checkIn} → {b.checkOut}
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
