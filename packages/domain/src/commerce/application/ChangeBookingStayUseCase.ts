import type { Booking } from "../booking/domain/Booking";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type {
  IBookingRepository,
  IQuoteRepository,
  ICommerceFlowRepository,
} from "../ports/CommercePorts";
import { ReservationOrchestrator } from "../reservation/ReservationOrchestrator";
import type { StayChangeDraft, StayChangePreview } from "../reservation/types";
import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import { PERMISSIONS } from "@hcp/permissions";
import { assertCommercePropertyAccess } from "./commerceAccess";

export interface ChangeBookingStayCommand extends StayChangeDraft {
  tenantId: string;
  bookingId: string;
}

export class ChangeBookingStayUseCase {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly quoteRepository: IQuoteRepository,
    private readonly commerceFlowRepository: ICommerceFlowRepository,
    private readonly orchestrator: ReservationOrchestrator,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLogRepository: IAuditLogRepository,
  ) {}

  async preview(
    command: ChangeBookingStayCommand,
    actor: ActorContext,
  ): Promise<Result<StayChangePreview, Error>> {
    try {
      const booking = await this.loadBookingWithAccess(command, actor);
      if (booking.isFailure) {
        return Result.fail(booking.getError());
      }

      const currentQuote = await this.quoteRepository.findById(
        booking.getValue().quoteId,
        command.tenantId,
      );
      if (!currentQuote) {
        return Result.fail(new ValidationError("Quote not found"));
      }

      return this.orchestrator.previewStayChange(booking.getValue(), command, currentQuote);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async execute(
    command: ChangeBookingStayCommand,
    actor: ActorContext,
    audit?: { ipAddress: string | null },
  ): Promise<Result<Booking, Error>> {
    try {
      const bookingResult = await this.loadBookingWithAccess(command, actor);
      if (bookingResult.isFailure) {
        return Result.fail(bookingResult.getError());
      }

      const booking = bookingResult.getValue();
      const commitResult = await this.orchestrator.commitStayChange(booking, command);
      if (commitResult.isFailure) {
        return Result.fail(commitResult.getError());
      }

      const { booking: updatedBooking, quote } = commitResult.getValue();
      await this.commerceFlowRepository.saveStayChange(quote, updatedBooking);

      await this.auditLogRepository.append({
        tenantId: command.tenantId,
        actorId: actor.userId,
        action: "booking.stay_changed",
        resourceType: "Booking",
        resourceId: updatedBooking.id,
        metadata: {
          unitId: command.unitId,
          checkIn: command.checkIn,
          checkOut: command.checkOut,
          guestCount: command.guestCount,
          quoteId: quote.id,
        },
        ipAddress: audit?.ipAddress ?? null,
      });

      return Result.ok(updatedBooking);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async loadBookingWithAccess(
    command: ChangeBookingStayCommand,
    actor: ActorContext,
  ): Promise<Result<Booking, Error>> {
    if (
      !this.permissionChecker.hasPermission(
        actor,
        PERMISSIONS.BOOKING_UPDATE_TENANT,
        command.tenantId,
      )
    ) {
      return Result.fail(new ForbiddenError());
    }

    const booking = await this.bookingRepository.findById(command.bookingId, command.tenantId);
    if (!booking) {
      return Result.fail(new ValidationError("Booking not found"));
    }

    assertCommercePropertyAccess(
      this.permissionChecker,
      actor,
      command.tenantId,
      booking.propertyId,
      PERMISSIONS.BOOKING_UPDATE_TENANT,
      PERMISSIONS.BOOKING_READ_ASSIGNED,
    );

    return Result.ok(booking);
  }
}
