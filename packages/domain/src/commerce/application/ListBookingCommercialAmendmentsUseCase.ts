import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type {
  ActorContext,
  PermissionChecker,
} from "../../shared/services/PermissionChecker";
import { PERMISSIONS } from "@hcp/permissions";
import type { BookingPricingIntent } from "../shared/types/CommerceTypes";
import type { MutationOriginKind } from "../../shared/types/MutationOrigin";
import type { IBookingRepository } from "../ports/CommercePorts";
import type { IBookingCommercialAmendmentRepository } from "../ports/IBookingCommercialAmendmentRepository";
import { assertCommercePropertyAccess } from "./commerceAccess";

/** Safe operator-facing commercial amendment fields (no confirmation secrets). */
export interface BookingCommercialAmendmentListItem {
  id: string;
  bookingId: string;
  propertyId: string;
  previousQuoteId: string;
  newQuoteId: string;
  previousTotalAmount: string;
  newTotalAmount: string;
  deltaAmount: string;
  currency: string;
  pricingIntent: BookingPricingIntent;
  reason: string;
  actorId: string;
  mutationOrigin: MutationOriginKind;
  createdAt: string;
}

/**
 * BFS-4 Phase 0 — read-only commercial amendment history for a booking.
 * Tenant-scoped list + booking-read ACL; never returns confirmation digests.
 */
export class ListBookingCommercialAmendmentsUseCase {
  constructor(
    private readonly bookingRepository: IBookingRepository,
    private readonly amendmentRepository: IBookingCommercialAmendmentRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    bookingId: string,
    actor: ActorContext,
  ): Promise<Result<BookingCommercialAmendmentListItem[], Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.BOOKING_READ_TENANT,
          tenantId,
        ) &&
        !this.permissionChecker.hasPermission(
          actor,
          PERMISSIONS.BOOKING_READ_ASSIGNED,
          tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const booking = await this.bookingRepository.findById(bookingId, tenantId);
      if (!booking) {
        return Result.fail(new NotFoundError("Booking", bookingId));
      }

      assertCommercePropertyAccess(
        this.permissionChecker,
        actor,
        tenantId,
        booking.propertyId,
        PERMISSIONS.BOOKING_READ_TENANT,
        PERMISSIONS.BOOKING_READ_ASSIGNED,
      );

      const rows = await this.amendmentRepository.listByBookingId(
        tenantId,
        bookingId,
      );

      const items = rows
        .filter((row) => row.propertyId === booking.propertyId)
        .map(toListItem)
        .sort(compareAmendmentsNewestFirst);

      return Result.ok(items);
    } catch (error) {
      if (error instanceof ForbiddenError || error instanceof ValidationError) {
        return Result.fail(error);
      }
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}

function toListItem(
  amendment: {
    id: string;
    bookingId: string;
    propertyId: string;
    previousQuoteId: string;
    newQuoteId: string;
    previousTotalAmount: string;
    newTotalAmount: string;
    deltaAmount: string;
    currency: string;
    pricingIntent: BookingPricingIntent;
    reason: string;
    actorId: string;
    mutationOrigin: MutationOriginKind;
    createdAt: Date;
  },
): BookingCommercialAmendmentListItem {
  return {
    id: amendment.id,
    bookingId: amendment.bookingId,
    propertyId: amendment.propertyId,
    previousQuoteId: amendment.previousQuoteId,
    newQuoteId: amendment.newQuoteId,
    previousTotalAmount: amendment.previousTotalAmount,
    newTotalAmount: amendment.newTotalAmount,
    deltaAmount: amendment.deltaAmount,
    currency: amendment.currency,
    pricingIntent: amendment.pricingIntent,
    reason: amendment.reason,
    actorId: amendment.actorId,
    mutationOrigin: amendment.mutationOrigin,
    createdAt: amendment.createdAt.toISOString(),
  };
}

/** Newest first; identical timestamps break ties by id (stable / deterministic). */
function compareAmendmentsNewestFirst(
  a: BookingCommercialAmendmentListItem,
  b: BookingCommercialAmendmentListItem,
): number {
  const delta =
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (delta !== 0) return delta;
  return b.id.localeCompare(a.id);
}
