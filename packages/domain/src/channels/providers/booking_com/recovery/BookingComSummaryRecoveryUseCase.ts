import { Result } from "../../../../shared/kernel/Result";
import type { ReceiveChannelEventUseCase } from "../../../application/ReceiveChannelEventUseCase";
import type { IBookingComReservationsClient } from "../reservations/IBookingComReservationsClient";
import {
  BookingComHotelId,
  BookingComReservationId,
  BookingComRuid,
} from "../ids/BookingComIds";
import { mapBookingComReservationMessageToProviderMessage } from "../parse/mapBookingComReservationToProviderMessage";
import { parseBookingComReservationXml } from "../parse/parseBookingComReservationXml";

export interface BookingComSummaryRecoveryCommand {
  tenantId: string;
  connectionId: string;
  hotelId?: string;
  fallbackHotelId?: string | null;
}

export interface BookingComSummaryRecoveryResult {
  scanned: number;
  ingested: number;
  deduplicated: number;
  failed: number;
}

/**
 * Pulls /reservationssummary basics and re-enters missing reservations via Receive only.
 */
export class BookingComSummaryRecoveryUseCase {
  constructor(
    private readonly reservationsClient: IBookingComReservationsClient,
    private readonly receiveChannelEventUseCase: ReceiveChannelEventUseCase,
  ) {}

  async execute(
    command: BookingComSummaryRecoveryCommand,
  ): Promise<Result<BookingComSummaryRecoveryResult, Error>> {
    try {
      const summary = await this.reservationsClient.retrieveSummary({
        hotelId: command.hotelId
          ? BookingComHotelId(command.hotelId)
          : undefined,
      });

      let ingested = 0;
      let deduplicated = 0;
      let failed = 0;

      for (const item of summary.items) {
        const parsed = parseBookingComReservationXml(item.rawXml);
        const providerMessage = mapBookingComReservationMessageToProviderMessage({
          message: {
            kind: "create",
            providerMessageId: `summary:${item.reservationId}`,
            reservationId: BookingComReservationId(item.reservationId),
            hotelId: item.hotelId,
            providerUpdatedAt: null,
            revisionHint: `summary:${item.reservationId}`,
            rawXml: item.rawXml,
            ruid: summary.ruid ?? (parsed.ruid ? BookingComRuid(parsed.ruid) : null),
          },
          connectionId: command.connectionId,
          fallbackHotelId: command.fallbackHotelId ?? item.hotelId,
        });

        const received = await this.receiveChannelEventUseCase.execute({
          tenantId: command.tenantId,
          connectionId: command.connectionId,
          ingressKind: "poll",
          message: providerMessage,
        });

        if (received.isFailure) {
          failed += 1;
          continue;
        }
        if (received.getValue().deduplicated) {
          deduplicated += 1;
        } else {
          ingested += 1;
        }
      }

      return Result.ok({
        scanned: summary.items.length,
        ingested,
        deduplicated,
        failed,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
