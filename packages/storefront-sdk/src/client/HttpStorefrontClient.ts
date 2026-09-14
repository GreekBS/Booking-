import { ErrorCodes, StorefrontError } from "../errors/StorefrontError.js";
import {
  createBookingRequestSchema,
  createHoldRequestSchema,
  createQuoteRequestSchema,
  publishableKeySchema,
  stayQuerySchema,
} from "../validation/schemas.js";
import type { IStorefrontClient } from "./IStorefrontClient.js";
import type {
  ApiResponse,
  AvailabilityResult,
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
  mockStorefrontConfig,
  mockWidgetConfig,
} from "../mock/fixtures.js";

export class HttpStorefrontClient implements IStorefrontClient {
  private readonly publishableKey: string;
  private readonly baseUrl: string;
  private readonly locale: string;

  constructor(config: StorefrontClientConfig) {
    publishableKeySchema.parse(config.publishableKey);
    if (!config.baseUrl) {
      throw new StorefrontError(
        ErrorCodes.VALIDATION_ERROR,
        "baseUrl is required for live Storefront API",
        400,
      );
    }
    this.publishableKey = config.publishableKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.locale = config.locale ?? "en-US";
  }

  async getConfig(): Promise<StorefrontConfig> {
    return { ...mockStorefrontConfig, locale: this.locale };
  }

  async getWidgetConfig(): Promise<WidgetConfig> {
    return { ...mockWidgetConfig, embedModes: [...mockWidgetConfig.embedModes] };
  }

  async listProperties(_params?: PropertyListParams): Promise<PropertyListResult> {
    return { items: [], nextCursor: null };
  }

  async getProperty(slug: string): Promise<PublicProperty> {
    return this.request<PublicProperty>("GET", `/properties/${encodeURIComponent(slug)}`);
  }

  async getUnit(propertySlug: string, unitSlug: string): Promise<PublicUnit> {
    const property = await this.getProperty(propertySlug);
    const unit = property.units.find((entry) => entry.slug === unitSlug);
    if (!unit) {
      throw new StorefrontError(ErrorCodes.NOT_FOUND, "Unit not found", 404);
    }
    return {
      ...unit,
      propertyId: property.id,
      propertySlug: property.slug,
    };
  }

  async checkAvailability(unitId: string, query: StayQuery): Promise<AvailabilityResult> {
    stayQuerySchema.parse(query);
    return this.request<AvailabilityResult>("POST", "/availability/check", {
      unitId,
      ...query,
    });
  }

  async previewPrice(unitId: string, query: StayQuery) {
    await this.checkAvailability(unitId, query);
    return {
      currency: "EUR",
      lineItems: [],
      subtotal: "0.0000",
      total: "0.0000",
      checkIn: query.checkIn,
      checkOut: query.checkOut,
    };
  }

  async searchAvailability(_request: SearchAvailabilityRequest): Promise<SearchAvailabilityResult> {
    return { results: [] };
  }

  async createHold(request: CreateHoldRequest, idempotencyKey?: string): Promise<PublicHold> {
    createHoldRequestSchema.parse(request);
    if (!idempotencyKey) {
      throw new StorefrontError(
        ErrorCodes.VALIDATION_ERROR,
        "Idempotency-Key is required for createHold",
        400,
      );
    }
    return this.request("POST", "/holds", request, { "Idempotency-Key": idempotencyKey });
  }

  async releaseHold(_holdId: string): Promise<void> {
    throw new StorefrontError(ErrorCodes.VALIDATION_ERROR, "releaseHold is not available", 501);
  }

  async createQuote(request: CreateQuoteRequest): Promise<PublicQuote> {
    createQuoteRequestSchema.parse(request);
    return this.request("POST", "/quotes", request);
  }

  async getQuote(quoteId: string): Promise<PublicQuote> {
    throw new StorefrontError(ErrorCodes.NOT_FOUND, `Quote ${quoteId} not found`, 404);
  }

  async createBooking(
    request: CreateBookingRequest,
    idempotencyKey?: string,
  ): Promise<PublicBooking> {
    createBookingRequestSchema.parse(request);
    if (!idempotencyKey) {
      throw new StorefrontError(
        ErrorCodes.VALIDATION_ERROR,
        "Idempotency-Key is required for createBooking",
        400,
      );
    }
    return this.request("POST", "/bookings", request, { "Idempotency-Key": idempotencyKey });
  }

  async getBooking(_confirmationCode: string): Promise<PublicBooking> {
    throw new StorefrontError(ErrorCodes.NOT_FOUND, "Booking not found", 404);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const response = await globalThis.fetch(`${this.baseUrl}/api/storefront/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.publishableKey}`,
        "Content-Type": "application/json",
        "X-HCP-Locale": this.locale,
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = (await response.json()) as ApiResponse<T>;

    if (payload.error) {
      throw StorefrontError.fromApiError(payload.error, response.status);
    }

    if (payload.data === null) {
      throw new StorefrontError(ErrorCodes.VALIDATION_ERROR, "Empty API response", response.status);
    }

    return payload.data;
  }
}
