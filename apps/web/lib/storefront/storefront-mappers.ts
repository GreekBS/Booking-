import type { Hold, Quote, Booking } from "@hcp/domain";
import type {
  PublicPropertyReadModel,
  PublicPropertyUnitReadModel,
} from "@hcp/domain";
import type { AvailabilityEvaluationResult } from "@hcp/domain";
import type { UnitAvailabilityRulesProps } from "@hcp/domain";

export function mapPublicProperty(property: PublicPropertyReadModel) {
  return {
    id: property.id,
    slug: property.slug,
    name: property.name,
    type: property.type,
    timezone: property.timezone,
    location: {
      city: property.city ?? "",
      country: property.country ?? "",
    },
    contentRefId: null,
    units: property.units.map(mapPublicUnitSummary),
  };
}

function mapPublicUnitSummary(unit: PublicPropertyUnitReadModel) {
  return {
    id: unit.id,
    slug: unit.slug,
    name: unit.name,
    maxGuests: unit.maxGuests,
    bedrooms: unit.bedrooms,
    bathrooms: unit.bathrooms,
    status: "published" as const,
  };
}

export function mapAvailabilityResult(
  result: AvailabilityEvaluationResult,
  rules: UnitAvailabilityRulesProps,
) {
  return {
    available: result.available,
    reasons: result.reasons,
    nights: result.nights,
    minNights: rules.minNights,
    maxNights: rules.maxNights,
  };
}

export function mapPublicHold(hold: Hold) {
  return {
    id: hold.id,
    unitId: hold.unitId,
    checkIn: hold.stayPeriod.checkIn.value,
    checkOut: hold.stayPeriod.checkOut.value,
    guestCount: hold.guestCount.value,
    expiresAt: hold.expiresAt.toISOString(),
  };
}

export function mapPublicQuote(quote: Quote) {
  return {
    id: quote.id,
    holdId: quote.holdId,
    expiresAt: quote.expiresAt.toISOString(),
    snapshot: {
      checkIn: quote.snapshot.checkIn,
      checkOut: quote.snapshot.checkOut,
      currency: quote.snapshot.currency,
      lineItems: quote.snapshot.lineItems.map((item) => ({
        date: item.date,
        amount: item.adjustedAmount,
        currency: item.currency,
      })),
      subtotal: quote.snapshot.subtotalAmount,
      fees: quote.snapshot.feesAmount,
      taxes: quote.snapshot.taxesAmount,
      total: quote.snapshot.totalAmount,
    },
  };
}

export function mapPublicBooking(booking: Booking) {
  const confirmationCode = `HCP-${booking.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;

  return {
    id: booking.id,
    status: booking.status,
    confirmationCode,
    checkIn: booking.stayPeriod.checkIn.value,
    checkOut: booking.stayPeriod.checkOut.value,
    guest: booking.guest,
  };
}
