import { NextRequest } from "next/server";
import {
  getBookingUseCase,
  getGuestUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  serializeBooking,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ bookingId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { bookingId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const permissionActor = toPermissionActor(actor);

    const result = await getBookingUseCase.execute(
      actor.tenantId,
      bookingId,
      permissionActor,
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const booking = result.getValue();
    const serialized = serializeBooking(booking);

    let linkedGuest: {
      id: string;
      displayName: string;
      email: string | null;
      phone: string | null;
    } | null = null;

    if (booking.guestId) {
      const guestResult = await getGuestUseCase.execute(
        {
          tenantId: actor.tenantId,
          guestId: booking.guestId,
          authorizedActivityPropertyIds: [booking.propertyId],
        },
        permissionActor,
      );
      if (guestResult.isSuccess) {
        const guest = guestResult.getValue();
        linkedGuest = {
          id: guest.id,
          displayName: guest.displayName,
          email: guest.email,
          phone: guest.phone,
        };
      }
    }

    return apiSuccess({ ...serialized, linkedGuest });
  } catch (error) {
    return apiError(error);
  }
}
