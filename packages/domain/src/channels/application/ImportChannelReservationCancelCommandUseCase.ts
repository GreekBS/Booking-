import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { Booking } from "../../commerce/booking/domain/Booking";
import type { IBookingRepository } from "../../commerce/ports/CommercePorts";
import type { ExternalReservationLink } from "../domain/ExternalReservationLink";
import type { IExternalReservationLinkRepository } from "../ports/IExternalReservationLinkRepository";
import type { ChannelReservationCancelMapping } from "../types/ChannelReservationImportMapping";

export interface ImportChannelReservationCancelCommand {
  mapping: ChannelReservationCancelMapping;
  existingLink: ExternalReservationLink;
  externalRevision: string | null;
  lastExternalUpdateAt: string | null;
}

export type ImportChannelReservationCancelCommandResult =
  | { outcome: "cancelled"; booking: Booking; link: ExternalReservationLink }
  | { outcome: "already_cancelled"; booking: Booking; link: ExternalReservationLink };

/**
 * Channel cancel path — booking.cancel() + repository save (calendar release via persistence).
 */
export class ImportChannelReservationCancelCommandUseCase {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly linkRepository: IExternalReservationLinkRepository,
  ) {}

  async execute(
    command: ImportChannelReservationCancelCommand,
  ): Promise<Result<ImportChannelReservationCancelCommandResult, Error>> {
    try {
      const booking = await this.bookingRepository.findById(
        command.existingLink.bookingId,
        command.existingLink.tenantId,
      );
      if (!booking) {
        return Result.fail(new ValidationError("Linked booking not found"));
      }

      if (booking.status === "cancelled") {
        if (command.existingLink.status !== "archived") {
          command.existingLink.updateExternalRevision({
            revision: command.externalRevision,
            lastExternalUpdateAt: command.lastExternalUpdateAt,
          });
          command.existingLink.archive();
          await this.linkRepository.save(command.existingLink);
        }
        return Result.ok({
          outcome: "already_cancelled",
          booking,
          link: command.existingLink,
        });
      }

      booking.cancel(command.mapping.reason ?? "Cancelled on Booking.com");
      await this.bookingRepository.save(booking);

      command.existingLink.updateExternalRevision({
        revision: command.externalRevision,
        lastExternalUpdateAt: command.lastExternalUpdateAt,
      });
      command.existingLink.archive();
      await this.linkRepository.save(command.existingLink);

      return Result.ok({
        outcome: "cancelled",
        booking,
        link: command.existingLink,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
