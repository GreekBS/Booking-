import { NextRequest } from "next/server";
import { NotFoundError, ValidationError } from "@hcp/domain";
import {
  getChannelConnectionUseCase,
  listChannelProductMappingsUseCase,
  channelReconciliationRunRepository,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";
import { serializeOperatorConnection } from "@/lib/channels/operator-connection-response";
import { getBookingComPartnerAccessStatus } from "@/lib/channels/booking-com-operator-access";
import {
  deriveBookingComOperatorPhase,
  serializeProductMapping,
  serializeReconciliationRun,
  serializeSetupRecord,
  BOOKING_COM_OPERATOR_PHASE_LABELS,
} from "@/lib/channels/booking-com-operator-view";
import { parseBookingComConnectionSetup } from "@hcp/domain";

type RouteContext = { params: Promise<{ connectionId: string }> };

function assertOperatorApiEnabled(): void {
  if (!isChannelOperatorApiEnabled()) {
    throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
  }
}

/**
 * GET Booking.com operator view: connection + setup + product mappings + recon + phase.
 * Never returns secrets.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { connectionId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    assertOperatorApiEnabled();

    const connectionResult = await getChannelConnectionUseCase.execute(
      { tenantId: actor.tenantId, connectionId },
      toPermissionActor(actor),
    );
    if (connectionResult.isFailure) {
      return mapResultError(connectionResult.getError());
    }
    const connection = connectionResult.getValue();
    if (connection.provider !== "booking_com") {
      throw new ValidationError("Connection is not a Booking.com connection");
    }

    const listed = await listChannelProductMappingsUseCase.execute({
      tenantId: actor.tenantId,
      connectionId,
    });
    if (listed.isFailure) {
      return mapResultError(listed.getError());
    }
    const { mappings, setup, mappingConfigGeneration } = listed.getValue();
    const active = mappings.filter((m) => m.status === "active");
    const setupParsed = setup
      ? parseBookingComConnectionSetup(setup.setup)
      : null;

    const partner = getBookingComPartnerAccessStatus();
    const phase = deriveBookingComOperatorPhase({
      connectionStatus: connection.status,
      setup: setupParsed,
      activeRoomMappings: active.filter((m) => m.kind === "unit_room").length,
      activeRateMappings: active.filter((m) => m.kind === "rate_plan").length,
      activeRoomRateMappings: active.filter((m) => m.kind === "room_rate").length,
      hasPropertyMapping: active.some((m) => m.kind === "property_hotel"),
      needsAttention: Boolean(connection.lastError),
      liveConnectivityAvailable: partner.liveConnectivityAvailable,
    });

    const recentRuns = await channelReconciliationRunRepository.listRecent(
      actor.tenantId,
      connectionId,
      10,
    );

    return apiSuccess({
      connection: serializeOperatorConnection(connection),
      partnerAccess: partner,
      phase,
      phaseLabel: BOOKING_COM_OPERATOR_PHASE_LABELS[phase],
      setup: serializeSetupRecord(setup),
      mappingConfigGeneration,
      mappings: mappings.map(serializeProductMapping),
      counts: {
        roomsMapped: active.filter((m) => m.kind === "unit_room").length,
        ratesMapped: active.filter((m) => m.kind === "rate_plan").length,
        roomratesMapped: active.filter((m) => m.kind === "room_rate").length,
        propertyMapped: active.some((m) => m.kind === "property_hotel"),
      },
      reconciliation: recentRuns.map(serializeReconciliationRun),
    });
  } catch (error) {
    return apiError(error);
  }
}
