import { NextRequest } from "next/server";
import {
  NotFoundError,
  ValidationError,
  parseBookingComConnectionSetup,
  projectTalosUnitAriSnapshot,
  projectAvailabilityDeltaToBookingCom,
  projectRateDeltaToBookingCom,
  projectRestrictionDeltaToBookingCom,
  type BookingComAriResolvedProjection,
} from "@hcp/domain";
import {
  getChannelConnectionUseCase,
  generateBookingComInitialSyncPreviewUseCase,
  confirmBookingComInitialSyncUseCase,
  listChannelProductMappingsUseCase,
  calendarBlockRepository,
  ratePlanRepository,
  availabilityRulesRepository,
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

async function loadMappedRoomState(input: {
  tenantId: string;
  hotelId: string;
  roomMaps: Array<{
    id: string;
    unitId: string | null;
    externalRoomTypeId: string | null;
    externalRatePlanId: string | null;
    mappingVersion: number;
    mappingConfigGeneration: number;
    kind: string;
    status: string;
  }>;
  from: string;
  to: string;
}) {
  const halfOpenTo = nextDay(input.to);
  const rooms = [];
  for (const m of input.roomMaps) {
    if (m.status !== "active" || !m.externalRoomTypeId || !m.unitId) continue;
    const [blocks, ratePlan, rules] = await Promise.all([
      calendarBlockRepository.findActiveBlocks(m.unitId, input.tenantId),
      ratePlanRepository.findByUnitId(m.unitId, input.tenantId),
      availabilityRulesRepository.findByUnitId(m.unitId, input.tenantId),
    ]);
    rooms.push({
      mappingId: m.id,
      mappingVersion: m.mappingVersion,
      mappingConfigGeneration: m.mappingConfigGeneration,
      unitId: m.unitId,
      roomTypeId: m.externalRoomTypeId,
      ratePlanId: m.externalRatePlanId,
      activeBlocks: blocks,
      ratePlan,
      rules,
      snapshot: projectTalosUnitAriSnapshot({
        hotelId: input.hotelId,
        roomTypeId: m.externalRoomTypeId,
        ratePlanId: m.externalRatePlanId,
        from: input.from,
        to: halfOpenTo,
        activeBlocks: blocks,
        ratePlan,
        rules,
        includePrices: true,
      }),
    });
  }
  return rooms;
}

function buildConfirmProjections(input: {
  tenantId: string;
  connectionId: string;
  hotelId: string;
  from: string;
  to: string;
  rooms: Awaited<ReturnType<typeof loadMappedRoomState>>;
}): BookingComAriResolvedProjection[] {
  const projections: BookingComAriResolvedProjection[] = [];
  for (const room of input.rooms) {
    const generation = room.mappingConfigGeneration;
    const nights = room.snapshot.nights;
    if (nights.length === 0) continue;

    const allSameAvail = nights.every(
      (n) =>
        n.roomsToSell === nights[0]!.roomsToSell && n.closed === nights[0]!.closed,
    );
    if (allSameAvail) {
      projections.push(
        projectAvailabilityDeltaToBookingCom({
          delta: {
            tenantId: input.tenantId,
            unitId: room.unitId,
            connectionId: input.connectionId,
            mappingId: room.mappingId,
            from: input.from,
            to: input.to,
            revision: generation,
            roomsToSell: nights[0]!.roomsToSell,
            closed: nights[0]!.closed,
          },
          hotelId: input.hotelId,
          roomTypeId: room.roomTypeId,
          mappingVersion: room.mappingVersion,
          generation,
        }),
      );
    } else {
      for (const night of nights) {
        projections.push(
          projectAvailabilityDeltaToBookingCom({
            delta: {
              tenantId: input.tenantId,
              unitId: room.unitId,
              connectionId: input.connectionId,
              mappingId: room.mappingId,
              from: night.date,
              to: nextDay(night.date),
              revision: generation,
              roomsToSell: night.roomsToSell,
              closed: night.closed,
            },
            hotelId: input.hotelId,
            roomTypeId: room.roomTypeId,
            mappingVersion: room.mappingVersion,
            generation,
          }),
        );
      }
    }

    if (room.ratePlanId && room.ratePlan && nights.some((n) => n.price != null)) {
      projections.push(
        projectRateDeltaToBookingCom({
          delta: {
            tenantId: input.tenantId,
            unitId: room.unitId,
            connectionId: input.connectionId,
            mappingId: room.mappingId,
            from: input.from,
            to: input.to,
            currency: room.ratePlan.currency,
            nightlyRates: nights
              .filter((n) => n.price != null)
              .map((n) => ({ date: n.date, amount: n.price! })),
          },
          hotelId: input.hotelId,
          roomTypeId: room.roomTypeId,
          ratePlanId: room.ratePlanId,
          mappingVersion: room.mappingVersion,
          generation,
        }),
      );
    }

    const sample = nights[0]!;
    projections.push(
      projectRestrictionDeltaToBookingCom({
        delta: {
          tenantId: input.tenantId,
          unitId: room.unitId,
          connectionId: input.connectionId,
          mappingId: room.mappingId,
          from: input.from,
          to: input.to,
          minStay: sample.minStay,
          maxStay: sample.maxStay,
          closedToArrival: sample.closedToArrival,
          closedToDeparture: sample.closedToDeparture,
        },
        hotelId: input.hotelId,
        roomTypeId: room.roomTypeId,
        ratePlanId: room.ratePlanId ?? "0",
        mappingVersion: room.mappingVersion,
        generation,
      }),
    );
  }
  return projections;
}

function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return dt.toISOString().slice(0, 10);
}

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

    const rooms = await loadMappedRoomState({
      tenantId: actor.tenantId,
      hotelId: parsed.hotelId,
      roomMaps,
      from: body.from,
      to: body.to,
    });

    const { cells, talosStateFingerprint } = buildBookingComLocalAriCells({
      hotelId: parsed.hotelId,
      rooms: rooms.map((r) => ({
        roomTypeId: r.roomTypeId,
        ratePlanId: r.ratePlanId,
        unitId: r.unitId,
        activeBlocks: r.activeBlocks,
        ratePlan: r.ratePlan,
        rules: r.rules,
      })),
      from: body.from,
      to: body.to,
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

    const rooms = await loadMappedRoomState({
      tenantId: actor.tenantId,
      hotelId: parsed.hotelId,
      roomMaps,
      from: body.from,
      to: body.to,
    });

    const projectionsToEnqueue = buildConfirmProjections({
      tenantId: actor.tenantId,
      connectionId,
      hotelId: parsed.hotelId,
      from: body.from,
      to: body.to,
      rooms,
    });

    const unique = new Map(
      projectionsToEnqueue.map((p) => [`${p.mappingId}:${p.fieldFamily}:${p.from}:${p.to}`, p]),
    );

    const result = await confirmBookingComInitialSyncUseCase.execute({
      tenantId: actor.tenantId,
      connectionId,
      confirmationToken: body.confirmationToken,
      mappingConfigGeneration: body.mappingConfigGeneration,
      talosStateFingerprint: body.talosStateFingerprint,
      remoteSnapshotFingerprint: body.remoteSnapshotFingerprint,
      from: body.from,
      to: body.to,
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
