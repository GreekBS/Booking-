import type { ChannelProviderMessage } from "../../../types/ChannelProviderMessage";
import type { ChannelSource } from "../../../types/ChannelSource";
import type { BookingComReservationMessage } from "../reservations/IBookingComReservationsClient";
import {
  parseBookingComReservationXml,
  type BookingComParsedReservation,
} from "./parseBookingComReservationXml";

const BOOKING_COM_PROVIDER: ChannelSource = "booking_com";

export const BOOKING_COM_PAYLOAD_KEYS = {
  rawXml: "rawXml",
  externalRevision: "externalRevision",
  hotelId: "hotelId",
  roomTypeId: "roomTypeId",
  ratePlanId: "ratePlanId",
  arrivalDate: "arrivalDate",
  departureDate: "departureDate",
  guestGivenName: "guestGivenName",
  guestSurname: "guestSurname",
  guestCount: "guestCount",
  ruid: "ruid",
  ackKind: "bookingComAckKind",
  ackProviderMessageId: "bookingComAckProviderMessageId",
  ackReservationId: "bookingComAckReservationId",
  ackResponseToken: "bookingComAckResponseToken",
} as const;

function kindToMessageKind(
  kind: BookingComParsedReservation["kind"],
): ChannelProviderMessage["kind"] {
  if (kind === "create") return "reservation.create";
  if (kind === "modify") return "reservation.modify";
  return "reservation.cancel";
}

function revisionFor(parsed: BookingComParsedReservation, providerMessageId: string): string {
  return (
    parsed.lastModifyDateTime ??
    parsed.createDateTime ??
    providerMessageId
  );
}

export function mapParsedBookingComReservationToProviderMessage(input: {
  parsed: BookingComParsedReservation;
  connectionId: string;
  providerMessageId: string;
  receivedAt?: Date;
  /** Fallback hotel id when XML omits HotelCode (e.g. connection setup binding). */
  fallbackHotelId?: string | null;
}): ChannelProviderMessage {
  const { parsed, connectionId, providerMessageId } = input;
  const hotelId = parsed.hotelId ?? input.fallbackHotelId ?? null;
  const revision = revisionFor(parsed, providerMessageId);

  return {
    messageId: providerMessageId,
    kind: kindToMessageKind(parsed.kind),
    receivedAt: input.receivedAt ?? new Date(),
    connectionId,
    provider: BOOKING_COM_PROVIDER,
    externalListingId: hotelId ?? undefined,
    externalUnitId: parsed.roomTypeId ?? undefined,
    externalReservationId: parsed.reservationId,
    externalUpdatedAt: parsed.lastModifyDateTime ?? parsed.createDateTime ?? undefined,
    payload: {
      [BOOKING_COM_PAYLOAD_KEYS.rawXml]: parsed.rawXml,
      [BOOKING_COM_PAYLOAD_KEYS.externalRevision]: revision,
      [BOOKING_COM_PAYLOAD_KEYS.hotelId]: hotelId,
      [BOOKING_COM_PAYLOAD_KEYS.roomTypeId]: parsed.roomTypeId,
      [BOOKING_COM_PAYLOAD_KEYS.ratePlanId]: parsed.ratePlanId,
      [BOOKING_COM_PAYLOAD_KEYS.arrivalDate]: parsed.arrivalDate,
      [BOOKING_COM_PAYLOAD_KEYS.departureDate]: parsed.departureDate,
      [BOOKING_COM_PAYLOAD_KEYS.guestGivenName]: parsed.guestGivenName,
      [BOOKING_COM_PAYLOAD_KEYS.guestSurname]: parsed.guestSurname,
      [BOOKING_COM_PAYLOAD_KEYS.guestCount]: parsed.guestCount,
      [BOOKING_COM_PAYLOAD_KEYS.ruid]: parsed.ruid,
      [BOOKING_COM_PAYLOAD_KEYS.ackKind]: parsed.kind,
      [BOOKING_COM_PAYLOAD_KEYS.ackProviderMessageId]: providerMessageId,
      [BOOKING_COM_PAYLOAD_KEYS.ackReservationId]: parsed.reservationId,
      [BOOKING_COM_PAYLOAD_KEYS.ackResponseToken]: null,
    },
  };
}

export function mapBookingComReservationMessageToProviderMessage(input: {
  message: BookingComReservationMessage;
  connectionId: string;
  fallbackHotelId?: string | null;
  receivedAt?: Date;
}): ChannelProviderMessage {
  const parsed = parseBookingComReservationXml(input.message.rawXml);
  return mapParsedBookingComReservationToProviderMessage({
    parsed: {
      ...parsed,
      kind: input.message.kind,
      reservationId: input.message.reservationId,
      hotelId: parsed.hotelId ?? input.message.hotelId,
      ruid: parsed.ruid ?? input.message.ruid,
    },
    connectionId: input.connectionId,
    providerMessageId: input.message.providerMessageId,
    fallbackHotelId: input.fallbackHotelId,
    receivedAt: input.receivedAt,
  });
}

export function readBookingComAckFromPayload(payload: Record<string, unknown>): {
  kind: "create" | "modify" | "cancel";
  providerMessageId: string;
  reservationId: string;
  responseToken: string | null;
} | null {
  const kind = payload[BOOKING_COM_PAYLOAD_KEYS.ackKind];
  const providerMessageId = payload[BOOKING_COM_PAYLOAD_KEYS.ackProviderMessageId];
  const reservationId = payload[BOOKING_COM_PAYLOAD_KEYS.ackReservationId];
  if (
    (kind !== "create" && kind !== "modify" && kind !== "cancel") ||
    typeof providerMessageId !== "string" ||
    providerMessageId.trim().length === 0 ||
    typeof reservationId !== "string" ||
    reservationId.trim().length === 0
  ) {
    return null;
  }
  const token = payload[BOOKING_COM_PAYLOAD_KEYS.ackResponseToken];
  return {
    kind,
    providerMessageId: providerMessageId.trim(),
    reservationId: reservationId.trim(),
    responseToken: typeof token === "string" ? token : null,
  };
}
