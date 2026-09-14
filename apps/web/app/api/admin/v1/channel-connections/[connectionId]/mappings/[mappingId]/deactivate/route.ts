import { NextRequest } from "next/server";
import { NotFoundError } from "@hcp/domain";
import { deactivateChannelListingMappingSchema } from "@hcp/validators";
import { deactivateChannelListingMappingUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";

type RouteContext = { params: Promise<{ connectionId: string; mappingId: string }> };

function assertOperatorApiEnabled(): void {
  if (!isChannelOperatorApiEnabled()) {
    throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
  }
}

/**
 * P1-S6c — deactivate (pause) or archive an iCal listing mapping.
 * Requires a paused connection; already-materialized blocks are retained.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { connectionId, mappingId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    assertOperatorApiEnabled();

    const body = deactivateChannelListingMappingSchema.parse(await request.json());

    const result = await deactivateChannelListingMappingUseCase.execute(
      {
        tenantId: actor.tenantId,
        connectionId,
        mappingId,
        mode: body.mode,
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
