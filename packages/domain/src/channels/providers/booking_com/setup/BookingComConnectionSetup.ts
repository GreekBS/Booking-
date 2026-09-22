import { ValidationError } from "../../../../shared/errors/DomainError";
import {
  BOOKING_COM_V1_CONNECTION_TYPES,
  BOOKING_COM_V1_DEFAULT_PRICING_MODEL,
  type BookingComConnectionType,
  type BookingComPricingModel,
} from "../connections/IBookingComConnectionsClient";
import { BookingComHotelId } from "../ids/BookingComIds";

/**
 * Provider-specific setup metadata for Booking.com connections.
 * Reuses ChannelConnection lifecycle statuses — this is NOT a second state machine.
 * Persisted via ChannelConnectionProviderSetup (CM-4c-4).
 */

export const BOOKING_COM_SETUP_PROGRESS_STEPS = [
  "credentials",
  "awaiting_remote_request",
  "remote_approved",
  "hotel_bound",
  "mapping_rooms",
  "mapping_rates",
  "sync_preview",
  "ready_to_activate",
] as const;

export type BookingComSetupProgressStep =
  (typeof BOOKING_COM_SETUP_PROGRESS_STEPS)[number];

export interface BookingComConnectionSetup {
  readonly hotelId: string | null;
  readonly approvedConnectionTypes: readonly BookingComConnectionType[];
  readonly pricingModel: BookingComPricingModel;
  readonly setupProgress: BookingComSetupProgressStep;
  readonly mappingReady: boolean;
  readonly initialSyncReady: boolean;
}

export function createDefaultBookingComConnectionSetup(): BookingComConnectionSetup {
  return {
    hotelId: null,
    approvedConnectionTypes: [...BOOKING_COM_V1_CONNECTION_TYPES],
    pricingModel: BOOKING_COM_V1_DEFAULT_PRICING_MODEL,
    setupProgress: "credentials",
    mappingReady: false,
    initialSyncReady: false,
  };
}

export function parseBookingComConnectionSetup(
  value: unknown,
): BookingComConnectionSetup {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Booking.com connection setup must be an object");
  }
  const record = value as Record<string, unknown>;

  const hotelIdRaw = record.hotelId;
  const hotelId =
    hotelIdRaw == null
      ? null
      : BookingComHotelId(typeof hotelIdRaw === "string" ? hotelIdRaw : String(hotelIdRaw));

  const pricingModel = record.pricingModel;
  if (pricingModel !== "Standard" && pricingModel !== "OBP" && pricingModel !== "LOS" && pricingModel !== "Derived") {
    throw new ValidationError("Booking.com pricingModel is invalid");
  }

  const setupProgress = record.setupProgress;
  if (
    typeof setupProgress !== "string" ||
    !BOOKING_COM_SETUP_PROGRESS_STEPS.includes(
      setupProgress as BookingComSetupProgressStep,
    )
  ) {
    throw new ValidationError("Booking.com setupProgress is invalid");
  }

  const approvedConnectionTypes = record.approvedConnectionTypes;
  if (!Array.isArray(approvedConnectionTypes)) {
    throw new ValidationError("Booking.com approvedConnectionTypes must be an array");
  }
  for (const entry of approvedConnectionTypes) {
    if (entry !== "Reservations" && entry !== "AVAILABILITY") {
      throw new ValidationError("Booking.com approvedConnectionTypes contains unknown type");
    }
  }

  if (typeof record.mappingReady !== "boolean") {
    throw new ValidationError("Booking.com mappingReady must be boolean");
  }
  if (typeof record.initialSyncReady !== "boolean") {
    throw new ValidationError("Booking.com initialSyncReady must be boolean");
  }

  return {
    hotelId,
    approvedConnectionTypes: approvedConnectionTypes as BookingComConnectionType[],
    pricingModel,
    setupProgress: setupProgress as BookingComSetupProgressStep,
    mappingReady: record.mappingReady,
    initialSyncReady: record.initialSyncReady,
  };
}

export function assertBookingComSetupReadyForActivation(
  setup: BookingComConnectionSetup,
): void {
  if (setup.hotelId == null) {
    throw new ValidationError("Booking.com setup requires hotelId before activation");
  }
  if (!setup.mappingReady) {
    throw new ValidationError("Booking.com setup requires mappingReady before activation");
  }
  if (!setup.initialSyncReady) {
    throw new ValidationError(
      "Booking.com setup requires initialSyncReady before activation",
    );
  }
  if (setup.pricingModel !== BOOKING_COM_V1_DEFAULT_PRICING_MODEL) {
    throw new ValidationError(
      "Booking.com V1 activation supports Standard pricing model only",
    );
  }
  if (setup.setupProgress !== "ready_to_activate") {
    throw new ValidationError(
      "Booking.com setupProgress must be ready_to_activate before activation",
    );
  }
}
