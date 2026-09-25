/**
 * Read-model query for tenant dashboard overview.
 * Aggregates only — never loads full quote trees or unbounded lists.
 */
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

export interface TenantDashboardOverviewReadModel {
  propertyCount: number;
  unitCount: number;
  /** Non-cancelled bookings (authoritative count). */
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
   * Sum of Booking.totalAmount for confirmed + completed.
   * Authoritative persisted booking amounts (not live quote re-fetch).
   */
  revenue: { total: string; currency: string } | null;
  /** Estimated occupancy % for the next 30 days (same semantics as prior UI). */
  occupancyPct: number;
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
    todayIso: string;
    arrivalsThroughIso: string;
    occupancyThroughIso: string;
    recentLimit: number;
  }): Promise<TenantDashboardOverviewReadModel>;
}
