import { NextRequest } from "next/server";
import {
  NotFoundError,
  ValidationError,
  projectAvailabilityDeltaToBookingCom,
  parseBookingComConnectionSetup,
} from "@hcp/domain";
import {
  getChannelConnectionUseCase,
  generateBookingComInitialSyncPreviewUseCase,
  confirmBookingComInitialSyncUseCase,
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
import { z } from "zod";

type RouteContext = { params: Promise<{ connectionId: string }> };

const previewSchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    expectedPropertyId: z.string().trim().min(1).max(255).nullable().optional(),
    activeUnitIds: z.array(z.string().trim().min(1).max(255)).max(200),
    activeRatePlanIds: z.array(z.string().trim().min(1).max(255)).max(200),
    unitPropertyIds: z.record(z.string().trim().min(1).max(255)).optional(),
  })
  .strict();

const confirmSchema = z
  .object({
    confirmationToken: z.string().trim().length(64),
    mappingConfigGeneration: z.number().int().min(0),
    talosStateFingerprint: z.string().trim().min(8).max(128),
    remoteSnapshotFingerprint: z.string().trim().min(1).max(128),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

    const body = previewSchema.parse(await request.json());
    const listed = await listChannelProductMappingsUseCase.execute({
      tenantId: actor.tenantId,
      connectionId,
    });
    if (listed.isFailure) return mapResultError(listed.getError());

    const setup = listed.getValue().setup;
    if (!setup) throw new ValidationError("Provider setup not found");
    const parsed = parseBookingComConnectionSetup(setup.setup);
    if (!parsed.hotelId) throw new ValidationError("Hotel binding required");

    const roomMaps = listed
      .getValue()
      .mappings.filter((m) => m.status === "active" && m.kind === "room_rate");
    const rooms = roomMaps.map((m) => ({
      roomTypeId: m.externalRoomTypeId!,
      ratePlanId: m.externalRatePlanId,
    }));

    const { cells, talosStateFingerprint } = buildBookingComLocalAriCells({
      hotelId: parsed.hotelId,
      rooms,
      from: body.from,
      to: body.to,
      roomsToSell: 1,
      price: 100,
    });

    const result = await generateBookingComInitialSyncPreviewUseCase.execute({
      tenantId: actor.tenantId,
      connectionId,
      from: body.from,
      to: body.to,
      expectedPropertyId: body.expectedPropertyId ?? null,
      activeUnitIds: body.activeUnitIds,
      activeRatePlanIds: body.activeRatePlanIds,
      unitPropertyIds: new Map(Object.entries(body.unitPropertyIds ?? {})),
      localCells: cells,
      talosStateFingerprint,
    });
    if (result.isFailure) return mapResultError(result.getError());

    const value = result.getValue();
    return apiSuccess({
      available: true,
      partnerAccess: partner,
      previewId: value.previewId,
      confirmationToken: value.confirmationToken,
      mappingConfigGeneration: value.mappingConfigGeneration,
      talosStateFingerprint: value.talosStateFingerprint,
      remoteSnapshotFingerprint: value.remoteSnapshotFingerprint,
      diff: value.diff,
      blockingIssueCount: value.blockingIssueCount,
      warningIssueCount: value.warningIssueCount,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
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

    const body = confirmSchema.parse(await request.json());
    const listed = await listChannelProductMappingsUseCase.execute({
      tenantId: actor.tenantId,
      connectionId,
    });
    if (listed.isFailure) return mapResultError(listed.getError());

    const setup = listed.getValue().setup;
    if (!setup) throw new ValidationError("Provider setup not found");
    const parsed = parseBookingComConnectionSetup(setup.setup);
    if (!parsed.hotelId) throw new ValidationError("Hotel binding required");

    const roomMaps = listed
      .getValue()
      .mappings.filter(
        (m) =>
          m.status === "active" &&
          (m.kind === "room_rate" || m.kind === "unit_room"),
      );

    const projectionsToEnqueue = roomMaps
      .filter((m) => m.externalRoomTypeId)
      .map((m) =>
        projectAvailabilityDeltaToBookingCom({
          delta: {
            tenantId: actor.tenantId,
            unitId: m.unitId ?? "unit",
            connectionId,
            mappingId: m.id,
            from: body.from,
            to: body.to,
            revision: m.mappingVersion,
            roomsToSell: 1,
            closed: 0,
          },
          hotelId: parsed.hotelId!,
          roomTypeId: m.externalRoomTypeId!,
          mappingVersion: m.mappingVersion,
          generation: m.mappingConfigGeneration,
        }),
      );

    // Prefer room_rate mappings; fall back to unit_room
    const unique = new Map(projectionsToEnqueue.map((p) => [p.mappingId, p]));

    const result = await confirmBookingComInitialSyncUseCase.execute({
      tenantId: actor.tenantId,
      connectionId,
      confirmationToken: body.confirmationToken,
      mappingConfigGeneration: body.mappingConfigGeneration,
      talosStateFingerprint: body.talosStateFingerprint,
      remoteSnapshotFingerprint: body.remoteSnapshotFingerprint,
      projectionsToEnqueue: [...unique.values()],
    });
    if (result.isFailure) return mapResultError(result.getError());

    return apiSuccess({
      available: true,
      ...result.getValue(),
    });
  } catch (error) {
    return apiError(error);
  }
}
