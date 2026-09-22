import type {
  ChannelReservationImportContext,
  IChannelReservationImportProvider,
} from "../../ports/providers/IChannelReservationImportProvider";
import type { ChannelProviderMessage } from "../../types/ChannelProviderMessage";
import type { ChannelReservationImportMapping } from "../../types/ChannelReservationImportMapping";
import { BOOKING_COM_PAYLOAD_KEYS } from "./parse/mapBookingComReservationToProviderMessage";

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readGuestCount(payload: Record<string, unknown>): number {
  const value = payload[BOOKING_COM_PAYLOAD_KEYS.guestCount];
  if (typeof value === "number" && Number.isInteger(value) && value >= 1) {
    return value;
  }
  return 1;
}

function guestFromPayload(payload: Record<string, unknown>): {
  name: string;
  email: string;
  phone: string | null;
} {
  const given = readString(payload, BOOKING_COM_PAYLOAD_KEYS.guestGivenName);
  const surname = readString(payload, BOOKING_COM_PAYLOAD_KEYS.guestSurname);
  const name = [given, surname].filter(Boolean).join(" ").trim();
  return {
    name: name.length > 0 ? name : "Booking.com guest",
    email: "booking-com-guest@invalid.talos.local",
    phone: null,
  };
}

/**
 * Maps Booking.com ChannelProviderMessage payloads into create/modify/cancel mappings.
 */
export class BookingComReservationImportProvider
  implements IChannelReservationImportProvider
{
  async mapMessage(
    message: ChannelProviderMessage,
    context: ChannelReservationImportContext,
  ): Promise<ChannelReservationImportMapping> {
    const externalId = message.externalReservationId?.trim();
    if (!externalId) {
      return { kind: "unrecognized", reason: "Missing Booking.com reservation id" };
    }

    const arrival = readString(message.payload, BOOKING_COM_PAYLOAD_KEYS.arrivalDate);
    const departure = readString(message.payload, BOOKING_COM_PAYLOAD_KEYS.departureDate);
    const revision =
      readString(message.payload, BOOKING_COM_PAYLOAD_KEYS.externalRevision) ??
      message.messageId;
    const guestCount = readGuestCount(message.payload);

    if (message.kind === "reservation.create") {
      if (!arrival || !departure) {
        return {
          kind: "unrecognized",
          reason: "Booking.com create message missing arrival/departure",
        };
      }
      return {
        kind: "create",
        command: {
          tenantId: context.tenantId,
          propertyId: context.propertyId,
          unitId: context.unitId,
          checkIn: arrival,
          checkOut: departure,
          guestCount,
          guest: guestFromPayload(message.payload),
          source: "booking_com",
          externalReference: {
            source: "booking_com",
            externalId,
          },
        },
      };
    }

    if (message.kind === "reservation.modify") {
      if (!arrival || !departure) {
        return {
          kind: "unrecognized",
          reason: "Booking.com modify message missing arrival/departure",
        };
      }
      return {
        kind: "modify",
        mapping: {
          externalReference: { source: "booking_com", externalId },
          connectionId: context.connectionId,
          proposed: {
            unitId: context.unitId,
            checkIn: arrival,
            checkOut: departure,
            guestCount,
          },
          externalUpdatedAt: message.externalUpdatedAt,
          idempotencyKey: `booking_com:modify:${context.connectionId}:${externalId}:${revision}`,
        },
      };
    }

    if (message.kind === "reservation.cancel") {
      return {
        kind: "cancel",
        mapping: {
          externalReference: { source: "booking_com", externalId },
          connectionId: context.connectionId,
          reason: "Cancelled on Booking.com",
          cancelledAt: message.externalUpdatedAt,
          idempotencyKey: `booking_com:cancel:${context.connectionId}:${externalId}:${revision}`,
        },
      };
    }

    return {
      kind: "unrecognized",
      reason: `Unsupported Booking.com message kind: ${message.kind}`,
    };
  }
}
