import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, NotFoundError } from "../../shared/errors/DomainError";
import type {
  DirectBookingCatalogSnapshot,
  DirectBookingIntegrationPublicLookup,
  IDirectBookingCatalogPort,
  IDirectBookingIntegrationRepository,
} from "../ports/DirectBookingPorts";
import {
  assertIntegrationEnabledForPublicAccess,
  evaluateDirectBookingPublishability,
  type DirectBookingNotBookableReason,
} from "./publishability";

export interface DirectBookingPublicConfigDto {
  integrationId: string;
  environment: "test" | "live";
  bookable: boolean;
  notBookableReasons: DirectBookingNotBookableReason[];
  property: {
    name: string;
    type: "villa" | "apartment" | "hotel" | "other";
    timezone: string;
  };
  unit: {
    name: string;
    maxGuests: number;
    bedrooms: number;
    bathrooms: number;
  };
  currency: string;
  stayRules: {
    minNights: number;
    maxNights: number;
    checkInDays: number[];
    checkOutDays: number[];
    advanceMinDays: number;
    advanceMaxDays: number;
    turnoverNights: number;
  } | null;
}

/**
 * Read-only public configuration for an external booking website/BFF.
 * Resolves Property/Unit server-side from the Direct Booking integration.
 * Never exposes tenant IDs, internal property IDs, or secrets.
 */
export class GetDirectBookingPublicConfigUseCase {
  constructor(
    private readonly integrations: IDirectBookingIntegrationRepository,
    private readonly catalog: IDirectBookingCatalogPort,
  ) {}

  async execute(
    integration: DirectBookingIntegrationPublicLookup,
  ): Promise<Result<DirectBookingPublicConfigDto, Error>> {
    try {
      assertIntegrationEnabledForPublicAccess(integration);

      const snapshot = await this.catalog.getCatalogSnapshot(
        integration.tenantId,
        integration.propertyId,
        integration.unitId,
      );
      if (!snapshot) {
        return Result.fail(new NotFoundError("Property", integration.propertyId));
      }

      // Draft/inactive inventory must not leak through public config.
      if (
        snapshot.property.status !== "active" ||
        snapshot.property.deletedAt !== null ||
        snapshot.unit.status !== "active" ||
        snapshot.unit.deletedAt !== null
      ) {
        return Result.fail(new NotFoundError("Property", integration.propertyId));
      }

      const publishability = evaluateDirectBookingPublishability(
        integration,
        snapshot,
        { requireRatePlan: true },
      );

      return Result.ok(mapPublicConfig(integration, snapshot, publishability));
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return Result.fail(error);
      }
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function mapPublicConfig(
  integration: DirectBookingIntegrationPublicLookup,
  snapshot: DirectBookingCatalogSnapshot,
  publishability: ReturnType<typeof evaluateDirectBookingPublishability>,
): DirectBookingPublicConfigDto {
  return {
    integrationId: integration.id,
    environment: integration.environment,
    bookable: publishability.bookable,
    notBookableReasons: publishability.reasons,
    property: {
      name: snapshot.property.name,
      type: snapshot.property.type,
      timezone: snapshot.property.timezone,
    },
    unit: {
      name: snapshot.unit.name,
      maxGuests: snapshot.unit.maxGuests,
      bedrooms: snapshot.unit.bedrooms,
      bathrooms: snapshot.unit.bathrooms,
    },
    currency: snapshot.currency,
    stayRules: snapshot.stayRules,
  };
}
