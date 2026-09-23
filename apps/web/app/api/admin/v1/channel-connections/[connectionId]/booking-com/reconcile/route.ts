import { NextRequest } from "next/server";
import { NotFoundError, ValidationError } from "@hcp/domain";
import {
  getChannelConnectionUseCase,
  reconcileBookingComConnectionUseCase,
  listChannelProductMappingsUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";
import { getBookingComPartnerAccessStatus } from "@/lib/channels/booking-com-operator-access";
import { buildBookingComLocalAriCells } from "@/lib/channels/booking-com-local-ari";
import { parseBookingComConnectionSetup } from "@hcp/domain";
import { z } from "zod";

type RouteContext = { params: Promise<{ connectionId: string }> };

const bodySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    activeUnitIds: z.array(z.string().trim().min(1).max(255)).max(200),
    activeRatePlanIds: z.array(z.string().trim().min(1).max(255)).max(200),
    unitPropertyIds: z.record(z.string().trim().min(1).max(255)).optional(),
    runReservationRecovery: z.boolean().optional(),
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

    const body = bodySchema.parse(await request.json());
    const listed = await listChannelProductMappingsUseCase.execute({
      tenantId: actor.tenantId,
      connectionId,
    });
    if (listed.isFailure) return mapResultError(listed.getError());

    const setup = listed.getValue().setup;
    const hotelId = setup
      ? parseBookingComConnectionSetup(setup.setup).hotelId
      : null;

    const roomMaps = listed
      .getValue()
      .mappings.filter((m) => m.status === "active" && m.kind === "room_rate");

    const { cells } = buildBookingComLocalAriCells({
      hotelId: hotelId ?? "0",
      rooms: roomMaps.map((m) => ({
        roomTypeId: m.externalRoomTypeId!,
        ratePlanId: m.externalRatePlanId,
      })),
      from: body.from,
      to: body.to,
    });

    const result = await reconcileBookingComConnectionUseCase.execute({
      tenantId: actor.tenantId,
      connectionId,
      from: body.from,
      to: body.to,
      activeUnitIds: body.activeUnitIds,
      activeRatePlanIds: body.activeRatePlanIds,
      unitPropertyIds: new Map(Object.entries(body.unitPropertyIds ?? {})),
      localCells: cells,
      runReservationRecovery: body.runReservationRecovery === true,
    });
    if (result.isFailure) return mapResultError(result.getError());

    return apiSuccess({
      available: true,
      partnerAccess: partner,
      outcomes: result.getValue().outcomes,
    });
  } catch (error) {
    return apiError(error);
  }
}
