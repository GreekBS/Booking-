import type {
  AvailabilityResult,
  CreateBookingRequest,
  CreateHoldRequest,
  CreateQuoteRequest,
  PricePreview,
  PropertyListParams,
  PropertyListResult,
  PublicBooking,
  PublicHold,
  PublicProperty,
  PublicQuote,
  PublicUnit,
  SearchAvailabilityRequest,
  SearchAvailabilityResult,
  StayQuery,
  StorefrontConfig,
  WidgetConfig,
} from "../types/index.js";

export interface IStorefrontClient {
  getConfig(): Promise<StorefrontConfig>;
  getWidgetConfig(): Promise<WidgetConfig>;
  listProperties(params?: PropertyListParams): Promise<PropertyListResult>;
  getProperty(slug: string): Promise<PublicProperty>;
  getUnit(propertySlug: string, unitSlug: string): Promise<PublicUnit>;
  checkAvailability(unitId: string, query: StayQuery): Promise<AvailabilityResult>;
  previewPrice(unitId: string, query: StayQuery): Promise<PricePreview>;
  searchAvailability(request: SearchAvailabilityRequest): Promise<SearchAvailabilityResult>;
  createHold(request: CreateHoldRequest, idempotencyKey?: string): Promise<PublicHold>;
  releaseHold(holdId: string): Promise<void>;
  createQuote(request: CreateQuoteRequest): Promise<PublicQuote>;
  getQuote(quoteId: string): Promise<PublicQuote>;
  createBooking(request: CreateBookingRequest, idempotencyKey?: string): Promise<PublicBooking>;
  getBooking(confirmationCode: string): Promise<PublicBooking>;
}
