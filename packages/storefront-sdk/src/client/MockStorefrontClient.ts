import { ErrorCodes, StorefrontError } from "../errors/StorefrontError.js";
import {
  createBookingRequestSchema,
  createHoldRequestSchema,
  createQuoteRequestSchema,
  publishableKeySchema,
  searchAvailabilityRequestSchema,
  stayQuerySchema,
} from "../validation/schemas.js";
import type { IStorefrontClient } from "./IStorefrontClient.js";
import type {
  CreateBookingRequest,
  CreateHoldRequest,
  CreateQuoteRequest,
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
  StorefrontClientConfig,
  StorefrontConfig,
  WidgetConfig,
} from "../types/index.js";
import {
  findPublishedUnit,
  mockAvailabilityAvailable,
  mockPricePreview,
  mockProperty,
  mockStorefrontConfig,
  mockUnit,
  mockWidgetConfig,
} from "../mock/fixtures.js";

function randomId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function confirmationCode(): string {
  return `HCP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

export class MockStorefrontClient implements IStorefrontClient {
  private readonly locale: string;
  private readonly holds = new Map<string, PublicHold>();
  private readonly quotes = new Map<string, PublicQuote>();
  private readonly bookings = new Map<string, PublicBooking>();
  private readonly bookingIdempotency = new Map<string, PublicBooking>();

  constructor(config: StorefrontClientConfig) {
    publishableKeySchema.parse(config.publishableKey);
    this.locale = config.locale ?? "en-US";
  }

  async getConfig(): Promise<StorefrontConfig> {
    return { ...mockStorefrontConfig, locale: this.locale };
  }

  async getWidgetConfig(): Promise<WidgetConfig> {
    return { ...mockWidgetConfig, embedModes: [...mockWidgetConfig.embedModes] };
  }

  async listProperties(_params?: PropertyListParams): Promise<PropertyListResult> {
    return {
      items: [mockProperty],
      nextCursor: null,
    };
  }

  async getProperty(slug: string): Promise<PublicProperty> {
    if (slug !== mockProperty.slug) {
      throw new StorefrontError(ErrorCodes.NOT_FOUND, "Property not found", 404);
    }
    return mockProperty;
  }

  async getUnit(propertySlug: string, unitSlug: string): Promise<PublicUnit> {
    if (propertySlug !== mockProperty.slug || unitSlug !== mockUnit.slug) {
      throw new StorefrontError(ErrorCodes.NOT_FOUND, "Unit not found", 404);
    }
    return mockUnit;
  }

  async checkAvailability(unitId: string, query: StayQuery) {
    stayQuerySchema.parse(query);
    this.assertUnitExists(unitId);
    if (query.checkOut <= query.checkIn) {
      throw new StorefrontError(ErrorCodes.VALIDATION_ERROR, "Invalid stay period", 400);
    }
    return mockAvailabilityAvailable(query.checkIn, query.checkOut);
  }

  async previewPrice(unitId: string, query: StayQuery) {
    stayQuerySchema.parse(query);
    this.assertUnitExists(unitId);
    return mockPricePreview(query.checkIn, query.checkOut);
  }

  async searchAvailability(request: SearchAvailabilityRequest): Promise<SearchAvailabilityResult> {
    searchAvailabilityRequestSchema.parse(request);
    const property = request.propertySlug
      ? await this.getProperty(request.propertySlug)
      : mockProperty;
    const results = property.units.map((unit) => {
      const preview = mockPricePreview(request.checkIn, request.checkOut);
      return {
        unit,
        property: { id: property.id, slug: property.slug, name: property.name },
        available: true,
        fromPrice: preview.total,
        currency: preview.currency,
      };
    });
    return { results };
  }

  async createHold(request: CreateHoldRequest, _idempotencyKey?: string): Promise<PublicHold> {
    createHoldRequestSchema.parse(request);
    this.assertUnitExists(request.unitId);
    const availability = await this.checkAvailability(request.unitId, request);
    if (!availability.available) {
      throw new StorefrontError(
        ErrorCodes.AVAILABILITY_UNAVAILABLE,
        "Selected dates are not available",
        409,
        availability.reasons,
      );
    }
    const now = new Date().toISOString();
    const hold: PublicHold = {
      id: randomId("hold"),
      unitId: request.unitId,
      checkIn: request.checkIn,
      checkOut: request.checkOut,
      guestCount: request.guestCount,
      expiresAt: addMinutes(now, 15),
    };
    this.holds.set(hold.id, hold);
    return hold;
  }

  async releaseHold(holdId: string): Promise<void> {
    if (!this.holds.has(holdId)) {
      throw new StorefrontError(ErrorCodes.NOT_FOUND, "Hold not found", 404);
    }
    this.holds.delete(holdId);
  }

  async createQuote(request: CreateQuoteRequest): Promise<PublicQuote> {
    createQuoteRequestSchema.parse(request);
    const hold = this.holds.get(request.holdId);
    if (!hold) {
      throw new StorefrontError(ErrorCodes.NOT_FOUND, "Hold not found", 404);
    }
    if (new Date(hold.expiresAt) <= new Date()) {
      throw new StorefrontError(ErrorCodes.HOLD_EXPIRED, "Hold has expired", 409);
    }
    const preview = mockPricePreview(hold.checkIn, hold.checkOut);
    const quote: PublicQuote = {
      id: randomId("quote"),
      holdId: hold.id,
      expiresAt: hold.expiresAt,
      snapshot: {
        checkIn: hold.checkIn,
        checkOut: hold.checkOut,
        currency: preview.currency,
        lineItems: preview.lineItems,
        subtotal: preview.subtotal,
        fees: "0.0000",
        taxes: "0.0000",
        total: preview.total,
      },
    };
    this.quotes.set(quote.id, quote);
    return quote;
  }

  async getQuote(quoteId: string): Promise<PublicQuote> {
    const quote = this.quotes.get(quoteId);
    if (!quote) {
      throw new StorefrontError(ErrorCodes.NOT_FOUND, "Quote not found", 404);
    }
    if (new Date(quote.expiresAt) <= new Date()) {
      throw new StorefrontError(ErrorCodes.QUOTE_EXPIRED, "Quote has expired", 409);
    }
    return quote;
  }

  async createBooking(
    request: CreateBookingRequest,
    idempotencyKey?: string,
  ): Promise<PublicBooking> {
    createBookingRequestSchema.parse(request);
    if (idempotencyKey && this.bookingIdempotency.has(idempotencyKey)) {
      return this.bookingIdempotency.get(idempotencyKey)!;
    }
    const quote = await this.getQuote(request.quoteId);
    const hold = this.holds.get(quote.holdId);
    if (!hold) {
      throw new StorefrontError(ErrorCodes.NOT_FOUND, "Hold not found", 404);
    }
    const booking: PublicBooking = {
      id: randomId("booking"),
      status: "pending",
      confirmationCode: confirmationCode(),
      checkIn: hold.checkIn,
      checkOut: hold.checkOut,
      guest: request.guest,
    };
    this.bookings.set(booking.confirmationCode, booking);
    this.holds.delete(hold.id);
    if (idempotencyKey) {
      this.bookingIdempotency.set(idempotencyKey, booking);
    }
    return booking;
  }

  async getBooking(confirmationCode: string): Promise<PublicBooking> {
    const booking = this.bookings.get(confirmationCode);
    if (!booking) {
      throw new StorefrontError(ErrorCodes.NOT_FOUND, "Booking not found", 404);
    }
    return booking;
  }

  private assertUnitExists(unitId: string): void {
    if (!findPublishedUnit(unitId)) {
      throw new StorefrontError(ErrorCodes.NOT_FOUND, "Unit not found", 404);
    }
  }
}

export function createMockStorefrontClient(
  config: Partial<StorefrontClientConfig> & Pick<StorefrontClientConfig, "publishableKey">,
): MockStorefrontClient {
  return new MockStorefrontClient({ mock: true, ...config });
}
