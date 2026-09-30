import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type {
  DirectBookingCatalogSnapshot,
  DirectBookingIntegrationPublicLookup,
  DirectBookingIntegrationStatus,
} from "../ports/DirectBookingPorts";

export type DirectBookingNotBookableReason =
  | "integration_inactive"
  | "property_not_active"
  | "unit_not_active"
  | "rate_plan_missing";

export interface DirectBookingPublishability {
  bookable: boolean;
  reasons: DirectBookingNotBookableReason[];
}

export function isIntegrationPubliclyEnabled(
  status: DirectBookingIntegrationStatus,
): boolean {
  return status === "active";
}

/**
 * Fail-closed publishability for Direct Booking public surfaces.
 * An integration alone never makes a draft/inactive property bookable.
 */
export function evaluateDirectBookingPublishability(
  integration: Pick<DirectBookingIntegrationPublicLookup, "status">,
  catalog: DirectBookingCatalogSnapshot,
  options: { requireRatePlan: boolean },
): DirectBookingPublishability {
  const reasons: DirectBookingNotBookableReason[] = [];

  if (!isIntegrationPubliclyEnabled(integration.status)) {
    reasons.push("integration_inactive");
  }

  if (
    catalog.property.status !== "active" ||
    catalog.property.deletedAt !== null
  ) {
    reasons.push("property_not_active");
  }

  if (catalog.unit.status !== "active" || catalog.unit.deletedAt !== null) {
    reasons.push("unit_not_active");
  }

  if (options.requireRatePlan && !catalog.hasRatePlan) {
    reasons.push("rate_plan_missing");
  }

  return { bookable: reasons.length === 0, reasons };
}

export function assertIntegrationEnabledForPublicAccess(
  integration: Pick<DirectBookingIntegrationPublicLookup, "status">,
): void {
  if (!isIntegrationPubliclyEnabled(integration.status)) {
    throw new ForbiddenError("Direct Booking integration is not active");
  }
}

export function assertDirectBookingBookable(
  publishability: DirectBookingPublishability,
): void {
  if (!publishability.bookable) {
    throw new ValidationError(
      `Direct Booking not available: ${publishability.reasons.join(",")}`,
    );
  }
}
