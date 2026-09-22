import type { ChannelPollResult } from "../../types/ChannelProviderMessage";
import type { ChannelPollExecutionContext } from "../../types/ChannelTransportExecutionContext";
import type { IChannelPollingProvider } from "../../ports/providers/IChannelPollingProvider";
import type { IChannelPollingDeliveryAcknowledger } from "../../ports/providers/IChannelPollingDeliveryAcknowledger";
import { ValidationError } from "../../../shared/errors/DomainError";
import {
  BookingComHotelId,
  BookingComReservationId,
} from "./ids/BookingComIds";
import type { IBookingComReservationsClient } from "./reservations/IBookingComReservationsClient";
import {
  mapBookingComReservationMessageToProviderMessage,
  readBookingComAckFromPayload,
} from "./parse/mapBookingComReservationToProviderMessage";
import type { ChannelProviderMessage } from "../../types/ChannelProviderMessage";

export interface BookingComPollingProviderOptions {
  readonly reservationsClient: IBookingComReservationsClient;
  readonly resolveFallbackHotelId?: (
    connectionId: string,
    credentialMaterial?: Record<string, string>,
  ) => string | null;
}

/**
 * Booking.com OTA poll adapter (CM-4c-2).
 * Retrieves new + modify/cancel messages, maps to ChannelProviderMessage.
 * ACK is deferred to acknowledgeDelivered after durable Receive success.
 */
export class BookingComPollingProvider
  implements IChannelPollingProvider, IChannelPollingDeliveryAcknowledger
{
  constructor(private readonly options: BookingComPollingProviderOptions) {}

  async poll(
    connectionId: string,
    cursor: string | null,
    context: ChannelPollExecutionContext,
  ): Promise<ChannelPollResult> {
    const fallbackHotelId =
      this.options.resolveFallbackHotelId?.(
        connectionId,
        context.credentialMaterial,
      ) ??
      context.credentialMaterial?.hotel_id ??
      null;

    const [created, modified] = await Promise.all([
      this.options.reservationsClient.retrieveNewReservations(),
      this.options.reservationsClient.retrieveModificationsAndCancellations(),
    ]);

    const messages = [...created.messages, ...modified.messages].map((message) =>
      mapBookingComReservationMessageToProviderMessage({
        message,
        connectionId,
        fallbackHotelId,
      }),
    );

    const nextCursor = `booking_com:ota:${cursor ?? "0"}:${messages.length}:${Date.now()}`;
    return { messages, nextCursor };
  }

  async acknowledgeDelivered(params: {
    connectionId: string;
    messages: readonly ChannelProviderMessage[];
    credentialMaterial?: Record<string, string>;
  }): Promise<void> {
    void params.connectionId;
    void params.credentialMaterial;

    for (const message of params.messages) {
      const ack = readBookingComAckFromPayload(message.payload);
      if (!ack) {
        throw new ValidationError(
          "Booking.com message is missing ACK identity after durable Receive",
        );
      }
      await this.options.reservationsClient.acknowledge({
        kind: ack.kind,
        providerMessageId: ack.providerMessageId,
        reservationId: BookingComReservationId(ack.reservationId),
        outcome: "success",
        responseToken: ack.responseToken,
      });
    }
  }
}

export function bookingComHotelIdFromMaterial(
  material: Record<string, string> | undefined,
): string | null {
  const hotelId = material?.hotel_id;
  if (typeof hotelId !== "string" || hotelId.trim().length === 0) {
    return null;
  }
  return BookingComHotelId(hotelId.trim());
}
