import { NextRequest } from "next/server";
import { NotFoundError } from "@hcp/domain";
import { upsertChannelListingMappingSchema } from "@hcp/validators";
import { upsertChannelListingMappingUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";

type RouteContext = { params: Promise<{ connectionId: string }> };

function assertOperatorApiEnabled(): void {
  if (!isChannelOperatorApiEnabled()) {
    throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
  }
}

/**
 * P1-S6c — create or update the iCal listing mapping for a connection.
 *
 * Unit reassignment and replacement require a paused connection and bump the
 * semantic epoch; property/external-identity edits do not. Every successful
 * mutation reports `requiresPollRematerialization`.
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { connectionId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    assertOperatorApiEnabled();

    const body = upsertChannelListingMappingSchema.parse(await request.json());

    const result = await upsertChannelListingMappingUseCase.execute(
      {
        tenantId: actor.tenantId,
        connectionId,
        mappingId: body.mappingId,
        replaceMappingId: body.replaceMappingId,
        externalListingId: body.externalListingId,
        externalUnitId: body.externalUnitId,
        propertyId: body.propertyId,
        unitId: body.unitId,
        syncDirection: body.syncDirection,
        expectedSemanticConfigVersion: body.expectedSemanticConfigVersion,
        reason: body.reason,
      },
      toPermissionActor(actor),
      { actorId: actor.userId, ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
