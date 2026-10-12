import { NextRequest } from "next/server";
import { ConflictError } from "@hcp/domain";
import {
  checkAvailabilityUseCase,
  createBookingUseCase,
  createHoldUseCase,
  createQuoteUseCase,
} from "@/lib/di/container";
import { manualBookingWizardSchema } from "@hcp/validators";
import {
  requireTenantContext,
  toPermissionActor,
  serializeBooking,
  serializeHold,
  serializeQuote,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = manualBookingWizardSchema.parse(await request.json());
    const permissionActor = toPermissionActor(actor);

    const availability = await checkAvailabilityUseCase.execute(
      {
        tenantId: actor.tenantId,
        unitId: body.unitId,
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        guestCount: body.guestCount,
      },
      permissionActor,
    );

    if (availability.isFailure) {
      return mapResultError(availability.getError());
    }

    if (!availability.getValue().available) {
      return mapResultError(new ConflictError("Dates are not available"));
    }

    const holdResult = await createHoldUseCase.execute(
      {
        tenantId: actor.tenantId,
        unitId: body.unitId,
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        guestCount: body.guestCount,
      },
      permissionActor,
    );

    if (holdResult.isFailure) {
      return mapResultError(holdResult.getError());
    }

    const quoteResult = await createQuoteUseCase.execute(
      {
        tenantId: actor.tenantId,
        holdId: holdResult.getValue().id,
      },
      permissionActor,
    );

    if (quoteResult.isFailure) {
      return mapResultError(quoteResult.getError());
    }

    // Default: confirm. Explicit confirm:false → operatorHold pending.
    const operatorHold = body.confirm === false;
    const bookingResult = await createBookingUseCase.execute(
      {
        tenantId: actor.tenantId,
        quoteId: quoteResult.getValue().id,
        guest: {
          name: body.guest.name,
          email: body.guest.email,
          phone: body.guest.phone ?? null,
        },
        confirmationMode: "manual",
        operatorHold,
        guestId: body.guestId ?? null,
      },
      permissionActor,
      { ipAddress: getClientIp(request) },
    );

    if (bookingResult.isFailure) {
      return mapResultError(bookingResult.getError());
    }

    const booking = bookingResult.getValue();

    return apiSuccess(
      {
        hold: serializeHold(holdResult.getValue()),
        quote: serializeQuote(quoteResult.getValue()),
        booking: serializeBooking(booking),
      },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
