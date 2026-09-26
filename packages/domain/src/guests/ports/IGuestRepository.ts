import type { Guest } from "../domain/Guest";

export interface GuestContactInput {
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  preferredLanguage?: string | null;
}

export type GuestIdentityLockKind = "email" | "phone";

/** Visible stay metrics — must be computed from actor-visible bookings only. */
export interface GuestDirectoryStayMetrics {
  stayCount: number;
  lastStayCheckOut: string | null;
  nextStayCheckIn: string | null;
}

export interface GuestDirectoryRow {
  guest: Guest;
  metrics: GuestDirectoryStayMetrics;
  tags: Array<{ id: string; name: string }>;
}

export interface GuestDirectoryFilters {
  tenantId: string;
  /**
   * null = tenant-wide (admin only).
   * string = Active Property relevance (Guests with booking activity at property).
   */
  propertyId: string | null;
  /**
   * null = tenant-wide reader.
   * string[] = Manager assigned properties (intersected with propertyId when set).
   */
  allowedPropertyIds: string[] | null;
  search?: string | null;
  includeArchived?: boolean;
  page: number;
  limit: number;
}

export interface PaginatedGuestDirectory {
  data: GuestDirectoryRow[];
  total: number;
  page: number;
  limit: number;
}

export interface GuestProfileMetrics {
  stayCount: number;
  firstStayCheckIn: string | null;
  lastStayCheckOut: string | null;
  nextStayCheckIn: string | null;
  propertyIdsVisited: string[];
}

export interface IGuestRepository {
  save(guest: Guest): Promise<void>;

  findById(tenantId: string, guestId: string): Promise<Guest | null>;

  findActiveByEmailNormalized(
    tenantId: string,
    emailNormalized: string,
  ): Promise<Guest[]>;

  findActiveByPhoneNormalized(
    tenantId: string,
    phoneNormalized: string,
  ): Promise<Guest[]>;

  withIdentityLock<T>(
    tenantId: string,
    kind: GuestIdentityLockKind,
    normalizedKey: string,
    fn: () => Promise<T>,
  ): Promise<T>;

  linkBookingGuestIfUnlinked(
    tenantId: string,
    bookingId: string,
    guestId: string,
  ): Promise<{ linked: boolean; alreadyLinked: boolean }>;

  findBookingGuestLink(
    tenantId: string,
    bookingId: string,
  ): Promise<{ guestId: string | null } | null>;

  /**
   * Bounded directory query: Guests with visible Booking activity.
   * Metrics and totals are computed only from allowedPropertyIds scope.
   */
  searchDirectory(filters: GuestDirectoryFilters): Promise<PaginatedGuestDirectory>;

  /**
   * True when Guest has at least one Booking in the visible property set.
   * Used for Manager access to Guest identity.
   */
  hasVisibleBookingActivity(
    tenantId: string,
    guestId: string,
    allowedPropertyIds: string[] | null,
  ): Promise<boolean>;

  /** Stay metrics from actor-visible bookings only. */
  getVisibleStayMetrics(
    tenantId: string,
    guestId: string,
    allowedPropertyIds: string[] | null,
  ): Promise<GuestProfileMetrics>;

  listVisibleBookingsForGuest(params: {
    tenantId: string;
    guestId: string;
    allowedPropertyIds: string[] | null;
    page: number;
    limit: number;
  }): Promise<{
    data: Array<{
      id: string;
      propertyId: string;
      unitId: string;
      checkIn: string;
      checkOut: string;
      status: string;
      guestCount: number;
      guestName: string;
      source: string | null;
    }>;
    total: number;
    page: number;
    limit: number;
  }>;
}
