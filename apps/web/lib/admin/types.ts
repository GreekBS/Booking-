export interface MeProfile {
  user: {
    id: string;
    email: string;
    name: string;
    platformRole: string | null;
    emailVerified: string | null;
  };
  memberships: Array<{
    id: string;
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    role: string;
    propertyIds: string[] | null;
    status: string;
  }>;
  activeTenantId: string | null;
}

export interface PropertyLocation {
  addressLine: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface PropertyPolicies {
  checkInTime: string;
  checkOutTime: string;
  cancellationPolicyType: string;
}

export interface UnitSummary {
  id: string;
  name: string;
  slug: string;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  status: string;
}

export interface PropertyRecord {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  status: string;
  timezone: string;
  location: PropertyLocation;
  policies: PropertyPolicies;
  amenityIds: string[];
  units: UnitSummary[];
}

export interface PaginatedProperties {
  data: PropertyRecord[];
  meta: { total: number; page: number; limit: number };
}

/** Slim catalog for pickers/filters — no amenities/location/policies. */
export interface CatalogUnitRecord {
  id: string;
  propertyId: string;
  name: string;
  status: string;
}

export interface CatalogPropertyRecord {
  id: string;
  name: string;
  status: string;
  units: CatalogUnitRecord[];
}

export interface PropertyUnitCatalog {
  properties: CatalogPropertyRecord[];
}

export interface DashboardOverviewRecentBooking {
  id: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  status: string;
  totalAmount: string;
  currency: string;
  unitName: string | null;
}

export interface DashboardOverviewRecord {
  propertyCount: number;
  unitCount: number;
  bookingCount: number;
  arrivalsNext7Days: number;
  departuresNext7Days: number;
  arrivalsToday: number;
  departuresToday: number;
  inHouseToday: number;
  activeHoldCount: number;
  revenue: { total: string; currency: string } | null;
  occupancyPct: number;
  recentBookings: DashboardOverviewRecentBooking[];
  todayArrivals: DashboardOverviewRecentBooking[];
  todayDepartures: DashboardOverviewRecentBooking[];
}

export interface AmenityRecord {
  id: string;
  tenantId: string | null;
  name: string;
  icon: string | null;
  category: string | null;
}

export interface MemberRecord {
  id: string;
  userId: string;
  role: string;
  status: string;
  propertyIds: string[] | null;
  user: { email: string; name: string } | null;
}

export interface PendingInvitationRecord {
  id: string;
  email: string;
  role: string;
  propertyIds: string[] | null;
  expiresAt: string;
}

export interface TenantSettingsRecord {
  timezone: string;
  defaultLocale: string;
  defaultCurrency: string;
  dateFormat: string;
  timeFormat: string;
}

export interface CommerceSettingsRecord {
  tenantId: string;
  defaultHoldTtlSeconds: number;
  confirmationMode: string;
  defaultCurrency: string;
}

export interface PublishableKeyRecord {
  id: string;
  keyPrefix: string;
  environment: string;
  allowedDomains: string[];
  isActive: boolean;
  createdAt: string;
}

export interface PaginatedBookings {
  data: BookingRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface HoldRecord {
  id: string;
  tenantId: string;
  unitId: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  status: string;
  expiresAt: string;
  sessionRef: string | null;
}

export interface BookingRecord {
  id: string;
  tenantId: string;
  unitId: string;
  propertyId: string;
  holdId: string;
  quoteId: string;
  quoteSnapshotId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  guest: { name: string; email: string; phone: string | null };
  /** CRM Guest identity link (nullable for legacy / recovery). */
  guestId?: string | null;
  /** Minimal linked Guest identity when authorized to read CRM Guest. */
  linkedGuest?: {
    id: string;
    displayName: string;
    email: string | null;
    phone: string | null;
  } | null;
  status: string;
  confirmationMode: string;
}

export interface StayChangePreviewRecord {
  available: boolean;
  unchanged: boolean;
  reasons: Array<{ code: string; message: string }>;
  current: {
    checkIn: string;
    checkOut: string;
    unitId: string;
    guestCount: number;
    totalAmount: string;
    currency: string;
  };
  proposed: {
    checkIn: string;
    checkOut: string;
    unitId: string;
    guestCount: number;
    totalAmount: string;
    currency: string;
  } | null;
  priceDelta: { amount: string; currency: string } | null;
}

export interface RatePlanRecord {
  baseNightlyAmount: string;
  currency: string;
  seasons: Array<{
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    nightlyAmount: string;
  }>;
  dowModifiers: Array<{
    dayOfWeek: number;
    modifierType: "fixed" | "percent";
    modifierValue: string;
  }>;
  losDiscounts: Array<{
    minNights: number;
    percentOff: string;
  }>;
}

export interface AvailabilityRulesRecord {
  minNights: number;
  maxNights: number;
  checkInDays: number[];
  checkOutDays: number[];
  advanceMinDays: number;
  advanceMaxDays: number;
  turnoverNights: number;
}

export type OperatorBlockType = "manual" | "maintenance" | "cleaning" | "owner";

export const OPERATOR_BLOCK_TYPES: OperatorBlockType[] = [
  "manual",
  "maintenance",
  "cleaning",
  "owner",
];

export interface CalendarRecord {
  blocks: Array<{
    id: string;
    unitId: string;
    blockType: OperatorBlockType | "hold" | "booking" | "turnover";
    status: string;
    checkIn: string;
    checkOut: string;
    sourceId: string | null;
    reason: string | null;
    expiresAt: string | null;
  }>;
  holds: Array<{
    id: string;
    checkIn: string;
    checkOut: string;
    status: string;
    expiresAt: string;
  }>;
  bookings: Array<{
    id: string;
    checkIn: string;
    checkOut: string;
    status: string;
    guestName: string;
  }>;
}

export interface FlatUnit extends UnitSummary {
  propertyId: string;
  propertyName: string;
}

export interface GuestIdentityRecord {
  id: string;
  tenantId: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  preferredLanguage: string | null;
  archivedAt: string | null;
  mergedIntoGuestId: string | null;
  anonymizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GuestTagRef {
  id: string;
  name: string;
}

export interface GuestDirectoryStayMetrics {
  stayCount: number;
  lastStayCheckOut: string | null;
  nextStayCheckIn: string | null;
}

/** Row from GET /guests (CRM directory). */
export interface GuestDirectoryRow {
  guest: GuestIdentityRecord;
  metrics: GuestDirectoryStayMetrics;
  tags: GuestTagRef[];
}

export interface PaginatedGuestDirectory {
  data: GuestDirectoryRow[];
  total: number;
  page: number;
  limit: number;
}

/** Flattened directory row for table rendering. */
export interface GuestRecord {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  stayCount: number;
  lastStayCheckOut: string | null;
  nextStayCheckIn: string | null;
  tags: GuestTagRef[];
}

export interface GuestProfileMetrics {
  stayCount: number;
  firstStayCheckIn: string | null;
  lastStayCheckOut: string | null;
  nextStayCheckIn: string | null;
  propertyIdsVisited: string[];
}

export interface GuestProfileRecord {
  guest: GuestIdentityRecord;
  metrics: GuestProfileMetrics;
  tags: GuestTagRef[];
}

export interface GuestNoteRecord {
  id: string;
  tenantId: string;
  guestId: string;
  authorUserId: string;
  propertyId: string | null;
  body: string;
  createdAt: string;
}

export interface GuestReservationRecord {
  id: string;
  propertyId: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  status: string;
  guestCount: number;
  guestName: string;
  source: string | null;
}

export interface PaginatedGuestReservations {
  data: GuestReservationRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface GuestTagRecord {
  id: string;
  tenantId: string;
  name: string;
  archivedAt: string | null;
  createdAt: string;
}

export interface GuestBookingSelectionRecord {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
}

export interface GuestContactInput {
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  preferredLanguage?: string | null;
}

export interface QuoteRecord {
  id: string;
  tenantId: string;
  holdId: string;
  unitId: string;
  propertyId: string;
  snapshotId: string;
  currency: string;
  subtotalAmount: string;
  feesAmount: string;
  taxesAmount: string;
  totalAmount: string;
  lineItems: Array<{
    date: string;
    baseAmount: string;
    adjustedAmount: string;
    currency: string;
  }>;
  quotedAt: string;
  expiresAt: string;
  createdAt: string;
}

export interface EnrichedBooking extends BookingRecord {
  propertyName?: string;
  unitName?: string;
  quote?: QuoteRecord | null;
}
