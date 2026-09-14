export const STOREFRONT_API_VERSION = "1";

import type { ThemeConfig } from "./theme.js";

export type PublishableKeyEnvironment = "test" | "live";

export interface StorefrontClientConfig {
  publishableKey: string;
  baseUrl?: string;
  locale?: string;
  sessionId?: string;
  mock?: boolean;
}

export interface ApiMeta {
  requestId: string;
  locale: string;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: ApiErrorDetail[];
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiErrorBody | null;
  meta: ApiMeta;
}

export type PropertyType = "villa" | "apartment" | "hotel" | "other";
export type PublishedStatus = "published";

export interface PublicLocation {
  city: string;
  country: string;
}

export interface PublicUnitSummary {
  id: string;
  slug: string;
  name: string;
  maxGuests: number;
  bedrooms: number | null;
  bathrooms: number | null;
  status: PublishedStatus;
}

export interface PublicProperty {
  id: string;
  slug: string;
  name: string;
  type: PropertyType;
  timezone: string;
  location: PublicLocation;
  units: PublicUnitSummary[];
  contentRefId?: string | null;
}

export interface PublicUnit extends PublicUnitSummary {
  propertyId: string;
  propertySlug: string;
}

export interface AvailabilityReason {
  code: string;
  message: string;
}

export interface NightAvailability {
  date: string;
  available: boolean;
}

export interface AvailabilityResult {
  available: boolean;
  reasons: AvailabilityReason[];
  nights: NightAvailability[];
  minNights: number;
  maxNights: number;
}

export interface NightlyLineItem {
  date: string;
  amount: string;
  currency: string;
}

export interface PricePreview {
  currency: string;
  lineItems: NightlyLineItem[];
  subtotal: string;
  total: string;
  checkIn: string;
  checkOut: string;
}

export interface PublicHold {
  id: string;
  unitId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  expiresAt: string;
}

export interface QuoteSnapshotPublic {
  checkIn: string;
  checkOut: string;
  currency: string;
  lineItems: NightlyLineItem[];
  subtotal: string;
  fees: string;
  taxes: string;
  total: string;
}

export interface PublicQuote {
  id: string;
  holdId: string;
  expiresAt: string;
  snapshot: QuoteSnapshotPublic;
}

export interface GuestContact {
  name: string;
  email: string;
  phone?: string | null;
}

export type BookingStatus =
  | "pending"
  | "payment_pending"
  | "confirmed"
  | "cancelled"
  | "completed";

export interface PublicBooking {
  id: string;
  status: BookingStatus;
  confirmationCode: string;
  checkIn: string;
  checkOut: string;
  guest: GuestContact;
}

export interface SearchAvailabilityUnitResult {
  unit: PublicUnitSummary;
  property: Pick<PublicProperty, "id" | "slug" | "name">;
  available: boolean;
  fromPrice: string;
  currency: string;
}

export interface SearchAvailabilityResult {
  results: SearchAvailabilityUnitResult[];
}

export interface StorefrontFeatures {
  multiUnitCart: boolean;
  payments: boolean;
}

export interface StorefrontConfig {
  apiVersion: string;
  locale: string;
  locales: string[];
  currency: string;
  confirmationMode: "manual" | "payment_required";
  features: StorefrontFeatures;
  theme: ThemeConfig;
}

export interface WidgetConfig {
  apiVersion: string;
  embedModes: Array<"inline" | "modal" | "iframe">;
  iframeUrlTemplate: string;
  widgetVersion: string;
}

export interface StayQuery {
  checkIn: string;
  checkOut: string;
  guestCount: number;
}

export interface CreateHoldRequest extends StayQuery {
  unitId: string;
  sessionId?: string;
}

export interface CreateQuoteRequest {
  holdId: string;
}

export interface CreateBookingRequest {
  quoteId: string;
  guest: GuestContact;
}

export interface SearchAvailabilityRequest extends StayQuery {
  propertySlug?: string;
}

export interface PropertyListParams {
  locale?: string;
  limit?: number;
  cursor?: string;
}

export interface PropertyListResult {
  items: PublicProperty[];
  nextCursor: string | null;
}
