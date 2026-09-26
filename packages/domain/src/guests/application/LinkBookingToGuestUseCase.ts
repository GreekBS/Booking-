import { Result } from "../../shared/kernel/Result";
import {
  ConflictError,
  ForbiddenError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { IBookingRepository } from "../../commerce/ports/CommercePorts";
import type { IGuestRepository } from "../ports/IGuestRepository";
import {
  assertCommercePropertyAccess,
} from "../../commerce/application/commerceAccess";

/**
 * Link an existing unlinked Booking to a Guest (recovery / explicit operator link).
 * Does not rewrite reservation contact snapshots.
 */
export class LinkBookingToGuestUseCase {
  constructor(
    private readonly bookings: IBookingRepository,
    private readonly guests: IGuestRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    input: { tenantId: string; bookingId: string; guestId: string },
    actor: ActorContext,
  ): Promise<Result<{ bookingId: string; guestId: string }, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.BOOKING_UPDATE_TENANT,
          input.tenantId,
        ) &&
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.GUEST_UPDATE_TENANT,
          input.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const booking = await this.bookings.findById(input.bookingId, input.tenantId);
      if (!booking) {
        return Result.fail(new ValidationError("Booking not found"));
      }

      assertCommercePropertyAccess(
        this.permissionChecker,
        actor,
        input.tenantId,
        booking.propertyId,
        PERMISSIONS.BOOKING_UPDATE_TENANT,
        PERMISSIONS.BOOKING_READ_ASSIGNED,
      );

      const guest = await this.guests.findById(input.tenantId, input.guestId);
      if (!guest || !guest.isActive) {
        return Result.fail(new ValidationError("Guest not found or not usable"));
      }

      if (booking.guestId && booking.guestId !== guest.id) {
        return Result.fail(
          new ConflictError("Booking already linked to a different Guest"),
        );
      }

      const link = await this.guests.linkBookingGuestIfUnlinked(
        input.tenantId,
        booking.id,
        guest.id,
      );
      if (!link.linked && !link.alreadyLinked) {
        return Result.fail(new ValidationError("Failed to link Booking to Guest"));
      }

      return Result.ok({ bookingId: booking.id, guestId: guest.id });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
