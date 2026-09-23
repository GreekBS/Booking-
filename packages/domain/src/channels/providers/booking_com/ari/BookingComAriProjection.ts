import type { ChannelSource } from "../../../types/ChannelSource";
import type {
  BookingComAriAvailabilitySegment,
  BookingComAriRateSegment,
  BookingComAriRestrictionSegment,
} from "./IBookingComAriClient";

/**
 * Resolved Booking.com ARI projection (adapter input).
 * Built by application layer from Talos-authoritative deltas — never invented by HTTP client.
 */
export type BookingComAriFieldFamily =
  | "availability"
  | "rates"
  | "restrictions"
  | "combined";

export interface BookingComAriResolvedProjection {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly mappingId: string;
  readonly mappingVersion: number;
  readonly hotelId: string;
  readonly roomTypeId: string;
  readonly ratePlanId: string | null;
  readonly from: string;
  readonly to: string;
  /** Monotonic generation for coalesce / stale suppression. */
  readonly generation: number;
  readonly fieldFamily: BookingComAriFieldFamily;
  readonly availability: readonly BookingComAriAvailabilitySegment[];
  readonly rates: readonly BookingComAriRateSegment[];
  readonly restrictions: readonly BookingComAriRestrictionSegment[];
  /**
   * When set to the same connection as the outbound connection, suppress echo
   * (reservation-origin inventory change must not loop back to that connection).
   */
  readonly inboundOriginProvider: ChannelSource | null;
  /** Preferred same-origin key — connection-specific (not provider-wide). */
  readonly inboundOriginConnectionId: string | null;
  readonly pricingModel: "Standard" | "OBP" | "LOS" | "Derived";
}

export interface BookingComAriCoalesceKeyParts {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly hotelId: string;
  readonly roomTypeId: string;
  readonly ratePlanId: string | null;
  readonly monthKey: string;
  readonly fieldFamily: BookingComAriFieldFamily;
}

export function buildBookingComAriCoalesceKey(
  parts: BookingComAriCoalesceKeyParts,
): string {
  const rate = parts.ratePlanId?.trim() || "-";
  return [
    "bcom-ari",
    parts.tenantId.trim(),
    parts.connectionId.trim(),
    parts.hotelId.trim(),
    parts.roomTypeId.trim(),
    rate,
    parts.monthKey.trim(),
    parts.fieldFamily,
  ].join(":");
}
