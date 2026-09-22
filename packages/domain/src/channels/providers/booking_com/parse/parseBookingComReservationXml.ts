import { ValidationError } from "../../../../shared/errors/DomainError";
import type { BookingComReservationMessageKind } from "../reservations/IBookingComReservationsClient";

/**
 * Strict-enough OTA XML field extraction for Booking.com V1 fixtures/protocol shapes.
 * Does not invent missing values. Never logs guest/payment content.
 */

export interface BookingComParsedReservation {
  readonly kind: BookingComReservationMessageKind;
  readonly reservationId: string;
  readonly hotelId: string | null;
  readonly roomTypeId: string | null;
  readonly ratePlanId: string | null;
  readonly arrivalDate: string | null;
  readonly departureDate: string | null;
  readonly guestGivenName: string | null;
  readonly guestSurname: string | null;
  readonly guestCount: number | null;
  readonly createDateTime: string | null;
  readonly lastModifyDateTime: string | null;
  readonly resStatus: string | null;
  readonly ruid: string | null;
  readonly rawXml: string;
}

export class BookingComXmlParseError extends ValidationError {
  constructor(message: string) {
    super(message);
    this.name = "BookingComXmlParseError";
  }
}

function readAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i");
  const match = tag.match(re);
  return match?.[1]?.trim() ? match[1].trim() : null;
}

function firstTag(xml: string, localName: string): string | null {
  const re = new RegExp(`<(?:\\w+:)?${localName}\\b([^>]*)>`, "i");
  const match = xml.match(re);
  return match?.[0] ?? null;
}

function textContent(xml: string, localName: string): string | null {
  const re = new RegExp(
    `<(?:\\w+:)?${localName}\\b[^>]*>([^<]*)</(?:\\w+:)?${localName}>`,
    "i",
  );
  const match = xml.match(re);
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

function extractRuid(xml: string): string | null {
  const comment = xml.match(/<!--\s*RUID:\s*\[([^\]]+)\]\s*-->/i);
  if (comment?.[1]) return comment[1].trim();
  return textContent(xml, "ruid");
}

function resolveKind(resStatus: string | null, rootHint: BookingComReservationMessageKind | null): BookingComReservationMessageKind {
  const status = (resStatus ?? "").toLowerCase();
  if (status === "cancel" || status === "cancelled") return "cancel";
  if (status === "modify" || status === "modified") return "modify";
  if (status === "commit" || status === "reserved" || status === "book") return "create";
  if (rootHint) return rootHint;
  throw new BookingComXmlParseError("Unable to determine reservation message kind from ResStatus");
}

function detectRootHint(xml: string): BookingComReservationMessageKind | null {
  if (/OTA_HotelResNotifRQ/i.test(xml) && !/OTA_HotelResModifyNotifRQ/i.test(xml)) {
    return "create";
  }
  if (/OTA_HotelResModifyNotifRQ/i.test(xml)) {
    return null; // rely on ResStatus
  }
  if (/<reservationssummary[\s>]/i.test(xml) || /<reservation[\s>]/i.test(xml)) {
    return "create";
  }
  return null;
}

/**
 * Parse a Booking.com OTA / summary XML body into structured reservation fields.
 */
export function parseBookingComReservationXml(rawXml: string): BookingComParsedReservation {
  if (typeof rawXml !== "string" || rawXml.trim().length === 0) {
    throw new BookingComXmlParseError("Reservation XML payload is empty");
  }

  const xml = rawXml.trim();

  // Summary-style recovery payload
  if (/<reservationssummary[\s>]/i.test(xml) || (/<reservation[\s>]/i.test(xml) && /<id>/i.test(xml))) {
    const reservationId = textContent(xml, "id");
    if (!reservationId) {
      throw new BookingComXmlParseError("Summary reservation id is required");
    }
    return {
      kind: "create",
      reservationId,
      hotelId: textContent(xml, "hotel_id"),
      roomTypeId: textContent(xml, "room_id"),
      ratePlanId: null,
      arrivalDate: textContent(xml, "arrival_date"),
      departureDate: textContent(xml, "departure_date"),
      guestGivenName: null,
      guestSurname: textContent(xml, "guest_name"),
      guestCount: null,
      createDateTime: null,
      lastModifyDateTime: null,
      resStatus: "Commit",
      ruid: extractRuid(xml),
      rawXml: xml,
    };
  }

  const hotelReservationTag =
    firstTag(xml, "HotelReservation") ?? firstTag(xml, "HotelResModify");
  if (!hotelReservationTag) {
    throw new BookingComXmlParseError("HotelReservation element is required");
  }

  const resStatus = readAttr(hotelReservationTag, "ResStatus");
  const createDateTime = readAttr(hotelReservationTag, "CreateDateTime");
  const lastModifyDateTime = readAttr(hotelReservationTag, "LastModifyDateTime");
  const kind = resolveKind(resStatus, detectRootHint(xml));

  const uniqueIdTag = firstTag(xml, "UniqueID");
  const reservationId = uniqueIdTag ? readAttr(uniqueIdTag, "ID") : null;
  if (!reservationId) {
    throw new BookingComXmlParseError("UniqueID/@ID reservation id is required");
  }

  const roomTypeTag = firstTag(xml, "RoomType");
  const ratePlanTag = firstTag(xml, "RatePlan");
  const timeSpanTag = firstTag(xml, "TimeSpan");
  const hotelCodeTag = firstTag(xml, "BasicPropertyInfo") ?? firstTag(xml, "HotelRef");

  const adults = textContent(xml, "AgeQualifyingCode") ? null : null;
  const guestCountAttr = timeSpanTag ? null : null;
  void adults;
  void guestCountAttr;

  const guestCountRaw = textContent(xml, "GuestCount") ?? readAttr(firstTag(xml, "GuestCount") ?? "", "Count");

  return {
    kind,
    reservationId,
    hotelId:
      readAttr(hotelCodeTag ?? "", "HotelCode") ??
      textContent(xml, "hotel_id") ??
      readAttr(firstTag(xml, "Hotel") ?? "", "HotelCode"),
    roomTypeId: roomTypeTag ? readAttr(roomTypeTag, "RoomTypeCode") : null,
    ratePlanId: ratePlanTag ? readAttr(ratePlanTag, "RatePlanCode") : null,
    arrivalDate: timeSpanTag ? readAttr(timeSpanTag, "Start") : null,
    departureDate: timeSpanTag ? readAttr(timeSpanTag, "End") : null,
    guestGivenName: textContent(xml, "GivenName"),
    guestSurname: textContent(xml, "Surname"),
    guestCount: guestCountRaw && /^\d+$/.test(guestCountRaw) ? Number(guestCountRaw) : null,
    createDateTime,
    lastModifyDateTime,
    resStatus,
    ruid: extractRuid(xml),
    rawXml: xml,
  };
}
