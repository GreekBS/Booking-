import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BookingComHotelId,
  BookingComReservationId,
  BookingComRuid,
  type BookingComReservationAckCommand,
  type BookingComReservationAckResult,
  type BookingComReservationMessage,
  type BookingComReservationRetrieveResult,
  type BookingComReservationSummaryResult,
  type IBookingComReservationsClient,
  parseBookingComReservationXml,
} from "../../../../src/channels";

const FIXTURES = join(__dirname, "..", "fixtures");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

function toMessage(
  kind: BookingComReservationMessage["kind"],
  xml: string,
  providerMessageId: string,
): BookingComReservationMessage {
  const parsed = parseBookingComReservationXml(xml);
  return {
    kind,
    providerMessageId,
    reservationId: BookingComReservationId(parsed.reservationId),
    hotelId: parsed.hotelId ? BookingComHotelId(parsed.hotelId) : null,
    providerUpdatedAt: parsed.lastModifyDateTime ?? parsed.createDateTime,
    revisionHint: parsed.lastModifyDateTime ?? parsed.createDateTime ?? providerMessageId,
    rawXml: xml,
    ruid: parsed.ruid ? BookingComRuid(parsed.ruid) : null,
  };
}

/**
 * In-memory Booking.com reservations client for CM-4c-2 tests — no network.
 */
export class FakeBookingComReservationsClient implements IBookingComReservationsClient {
  readonly acknowledged: BookingComReservationAckCommand[] = [];
  failAcknowledgeOnce = false;
  private queueNew: BookingComReservationMessage[] = [];
  private queueModify: BookingComReservationMessage[] = [];
  private summaryItems: BookingComReservationSummaryResult["items"] = [];

  seedFixtures(options?: {
    includeCreate?: boolean;
    includeModify?: boolean;
    includeCancel?: boolean;
    includeSummary?: boolean;
  }): void {
    const opts = {
      includeCreate: true,
      includeModify: false,
      includeCancel: false,
      includeSummary: false,
      ...options,
    };
    if (opts.includeCreate) {
      this.queueNew.push(
        toMessage("create", loadFixture("reservation-create.xml"), "msg-create-1"),
      );
    }
    if (opts.includeModify) {
      this.queueModify.push(
        toMessage("modify", loadFixture("reservation-modify.xml"), "msg-modify-1"),
      );
    }
    if (opts.includeCancel) {
      this.queueModify.push(
        toMessage("cancel", loadFixture("reservation-cancel.xml"), "msg-cancel-1"),
      );
    }
    if (opts.includeSummary) {
      const xml = loadFixture("reservation-summary.xml");
      const parsed = parseBookingComReservationXml(xml);
      this.summaryItems = [
        {
          reservationId: BookingComReservationId(parsed.reservationId),
          hotelId: parsed.hotelId ? BookingComHotelId(parsed.hotelId) : null,
          guestName: parsed.guestSurname,
          arrivalDate: parsed.arrivalDate,
          departureDate: parsed.departureDate,
          rawXml: xml,
        },
      ];
    }
  }

  async retrieveNewReservations(): Promise<BookingComReservationRetrieveResult> {
    const messages = [...this.queueNew];
    // OTA semantics: messages remain until ACK — keep queue until acknowledged
    return { messages, ruid: BookingComRuid("fake-ruid-new") };
  }

  async retrieveModificationsAndCancellations(): Promise<BookingComReservationRetrieveResult> {
    return {
      messages: [...this.queueModify],
      ruid: BookingComRuid("fake-ruid-modify"),
    };
  }

  async acknowledge(
    command: BookingComReservationAckCommand,
  ): Promise<BookingComReservationAckResult> {
    if (this.failAcknowledgeOnce) {
      this.failAcknowledgeOnce = false;
      throw new Error("simulated ACK failure");
    }
    this.acknowledged.push(command);
    this.queueNew = this.queueNew.filter(
      (m) => m.providerMessageId !== command.providerMessageId,
    );
    this.queueModify = this.queueModify.filter(
      (m) => m.providerMessageId !== command.providerMessageId,
    );
    return { accepted: true, ruid: BookingComRuid("fake-ruid-ack") };
  }

  async retrieveSummary(): Promise<BookingComReservationSummaryResult> {
    return {
      items: [...this.summaryItems],
      ruid: BookingComRuid("fake-ruid-summary"),
    };
  }
}
