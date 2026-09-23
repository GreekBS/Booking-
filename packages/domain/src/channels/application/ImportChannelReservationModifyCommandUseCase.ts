import { Result } from "../../shared/kernel/Result";
import { ConflictError, ValidationError } from "../../shared/errors/DomainError";
import type { Booking } from "../../commerce/booking/domain/Booking";
import type { IBookingRepository, ICommerceFlowRepository, IQuoteRepository } from "../../commerce/ports/CommercePorts";
import type { ReservationOrchestrator } from "../../commerce/reservation/ReservationOrchestrator";
import { mutationOriginChannel } from "../../shared/types/MutationOrigin";
import type { ExternalReservationLink } from "../domain/ExternalReservationLink";
import type { IExternalReservationLinkRepository } from "../ports/IExternalReservationLinkRepository";
import type { ChannelReservationModifyMapping } from "../types/ChannelReservationImportMapping";
import { AVAILABILITY_CONFLICT_MESSAGE } from "./ChannelInboxOutcomeClassifier";

export interface ImportChannelReservationModifyCommand {
  mapping: ChannelReservationModifyMapping;
  existingLink: ExternalReservationLink;
  mappingVersion: number;
  externalRevision: string | null;
  lastExternalUpdateAt: string | null;
}

export type ImportChannelReservationModifyCommandResult =
  | { outcome: "applied"; booking: Booking; link: ExternalReservationLink }
  | { outcome: "unchanged"; booking: Booking; link: ExternalReservationLink };

/**
 * Channel modify path — reuses ReservationOrchestrator + saveStayChange.
 * Does not call ChangeBookingStayUseCase (operator permissions).
 */
export class ImportChannelReservationModifyCommandUseCase {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly quoteRepository: IQuoteRepository,
    private readonly commerceFlowRepository: ICommerceFlowRepository,
    private readonly orchestrator: ReservationOrchestrator,
    private readonly linkRepository: IExternalReservationLinkRepository,
  ) {}

  async execute(
    command: ImportChannelReservationModifyCommand,
  ): Promise<Result<ImportChannelReservationModifyCommandResult, Error>> {
    try {
      const booking = await this.bookingRepository.findById(
        command.existingLink.bookingId,
        command.existingLink.tenantId,
      );
      if (!booking) {
        return Result.fail(new ValidationError("Linked booking not found"));
      }
      if (booking.status === "cancelled" || booking.status === "completed") {
        return Result.fail(
          new ValidationError(`Cannot modify booking in status ${booking.status}`),
        );
      }

      const draft = command.mapping.proposed;
      const unchanged =
        booking.unitId === draft.unitId &&
        booking.stayPeriod.checkIn.value === draft.checkIn &&
        booking.stayPeriod.checkOut.value === draft.checkOut &&
        booking.guestCount.value === draft.guestCount;

      if (unchanged) {
        command.existingLink.markSynced({
          mappingVersion: command.mappingVersion,
          externalRevision: command.externalRevision,
          lastExternalUpdateAt: command.lastExternalUpdateAt,
        });
        await this.linkRepository.save(command.existingLink);
        return Result.ok({ outcome: "unchanged", booking, link: command.existingLink });
      }

      const currentQuote = await this.quoteRepository.findById(
        booking.quoteId,
        command.existingLink.tenantId,
      );
      if (!currentQuote) {
        return Result.fail(new ValidationError("Quote not found"));
      }

      const origin = mutationOriginChannel({
        provider: command.existingLink.provider,
        connectionId: command.existingLink.connectionId,
        externalReservationId: command.existingLink.externalReservationId,
      });

      const commitResult = await this.orchestrator.commitStayChange(
        booking,
        draft,
        origin,
      );
      if (commitResult.isFailure) {
        const err = commitResult.getError();
        if (
          err instanceof ValidationError &&
          /not available|no longer available|overlap/i.test(err.message)
        ) {
          return Result.fail(new ConflictError(AVAILABILITY_CONFLICT_MESSAGE));
        }
        return Result.fail(err);
      }

      const { booking: updatedBooking, quote } = commitResult.getValue();
      await this.commerceFlowRepository.saveStayChange(quote, updatedBooking);

      command.existingLink.markSynced({
        mappingVersion: command.mappingVersion,
        externalRevision: command.externalRevision,
        lastExternalUpdateAt: command.lastExternalUpdateAt,
      });
      await this.linkRepository.save(command.existingLink);

      return Result.ok({
        outcome: "applied",
        booking: updatedBooking,
        link: command.existingLink,
      });
    } catch (error) {
      if (error instanceof ConflictError) {
        return Result.fail(error);
      }
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
