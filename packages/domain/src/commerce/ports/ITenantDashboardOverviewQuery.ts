/**
 * Read-model query for tenant dashboard overview.
 * Aggregates only — never loads full quote trees or unbounded lists.
 */
import type { AnalyticsPeriodWindow } from "../analytics/AnalyticsPeriod";

export interface DashboardRecentBookingReadModel {
  id: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  status: string;
  totalAmount: string;
  currency: string;
  /** Unit display name when available from catalog join. */
  unitName: string | null;
}

export interface DashboardPeriodAnalyticsReadModel {
  period: AnalyticsPeriodWindow;
  /** Confirmed + completed stay-prorated revenue in period. */
  revenue: { total: string; currency: string } | null;
  /** Confirmed + completed bookings overlapping period. */
  bookingCount: number;
  /** Confirmed + completed occupied nights in period. */
  occupiedNights: number;
  /** Occupied nights / (unitCount × period days), 0–100. */
  occupancyPct: number;
  /** Revenue / occupied nights; null when occupiedNights === 0. */
  adr: { amount: string; currency: string } | null;
  capacityNights: number;
}

export interface TenantDashboardOverviewReadModel {
  propertyCount: number;
  unitCount: number;
  /**
   * @deprecated Prefer periodAnalytics.bookingCount — kept briefly for older clients.
   * Non-cancelled all-time count is no longer the primary KPI.
   */
  bookingCount: number;
  arrivalsNext7Days: number;
  departuresNext7Days: number;
  /** Arrivals with checkIn = today (non-cancelled). */
  arrivalsToday: number;
  /** Departures with checkOut = today (non-cancelled). */
  departuresToday: number;
  /** Guests currently staying: checkIn ≤ today < checkOut (non-cancelled). */
  inHouseToday: number;
  activeHoldCount: number;
  /**
   * Period analytics revenue (same as periodAnalytics.revenue).
   * Kept at top level for MetricCard compatibility.
   */
  revenue: { total: string; currency: string } | null;
  /** Period occupancy % (same as periodAnalytics.occupancyPct). */
  occupancyPct: number;
  periodAnalytics: DashboardPeriodAnalyticsReadModel;
  /** Property-local today used for operational widgets. */
  localToday: string;
  propertyTimezone: string;
  recentBookings: DashboardRecentBookingReadModel[];
  /** Today's arrivals (bounded list for ops board). */
  todayArrivals: DashboardRecentBookingReadModel[];
  /** Today's departures (bounded list for ops board). */
  todayDepartures: DashboardRecentBookingReadModel[];
}

export interface ITenantDashboardOverviewQuery {
  getOverview(input: {
    tenantId: string;
    /** null = all properties; array = assigned-property scope */
    allowedPropertyIds: string[] | null;
    /** Property-local today YYYY-MM-DD. */
    todayIso: string;
    arrivalsThroughIso: string;
    /** Analytics period window (normalized). */
    period: AnalyticsPeriodWindow;
    recentLimit: number;
    propertyTimezone: string;
  }): Promise<TenantDashboardOverviewReadModel>;
}
