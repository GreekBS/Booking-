import { NextRequest } from "next/server";
import { NotFoundError, ValidationError } from "@hcp/domain";
import {
  getChannelConnectionUseCase,
  discoverBookingComRemoteConfigUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";
import { getBookingComPartnerAccessStatus } from "@/lib/channels/booking-com-operator-access";
import { z } from "zod";

type RouteContext = { params: Promise<{ connectionId: string }> };

const bodySchema = z
  .object({
    hotelId: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { connectionId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    if (!isChannelOperatorApiEnabled()) {
      throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
    }

    const partner = getBookingComPartnerAccessStatus();
    if (!partner.fixtureTransportEnabled && !partner.liveConnectivityAvailable) {
      return apiSuccess({
        available: false,
        partnerAccess: partner,
        discovery: null,
        message: partner.operatorMessage,
      });
    }

    const connectionResult = await getChannelConnectionUseCase.execute(
      { tenantId: actor.tenantId, connectionId },
      toPermissionActor(actor),
    );
    if (connectionResult.isFailure) {
      return mapResultError(connectionResult.getError());
    }
    if (connectionResult.getValue().provider !== "booking_com") {
      throw new ValidationError("Connection is not a Booking.com connection");
    }

    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const result = await discoverBookingComRemoteConfigUseCase.execute({
      tenantId: actor.tenantId,
      connectionId,
      hotelId: body.hotelId,
    });
    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const snap = result.getValue();
    return apiSuccess({
      available: true,
      partnerAccess: partner,
      discovery: {
        hotel: snap.hotel
          ? { hotelId: snap.hotel.hotelId, name: snap.hotel.name }
          : null,
        rooms: snap.rooms.map((r) => ({
          hotelId: r.hotelId,
          roomTypeId: r.roomTypeId,
          name: r.name,
        })),
        ratePlans: snap.ratePlans.map((r) => ({
          hotelId: r.hotelId,
          ratePlanId: r.ratePlanId,
          name: r.name,
        })),
        roomRates: snap.roomRates.map((r) => ({
          hotelId: r.hotelId,
          roomTypeId: r.roomTypeId,
          ratePlanId: r.ratePlanId,
          active: r.active,
        })),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
