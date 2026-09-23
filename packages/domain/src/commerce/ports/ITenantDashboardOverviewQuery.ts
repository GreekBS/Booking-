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
}

export interface TenantDashboardOverviewReadModel {
  propertyCount: number;
  unitCount: number;
  /** Non-cancelled bookings (authoritative count). */
  bookingCount: number;
  arrivalsNext7Days: number;
  departuresNext7Days: number;
  activeHoldCount: number;
  /**
   * Sum of Booking.totalAmount for confirmed + completed.
   * Authoritative persisted booking amounts (not live quote re-fetch).
   */
  revenue: { total: string; currency: string } | null;
  /** Estimated occupancy % for the next 30 days (same semantics as prior UI). */
  occupancyPct: number;
  recentBookings: DashboardRecentBookingReadModel[];
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
