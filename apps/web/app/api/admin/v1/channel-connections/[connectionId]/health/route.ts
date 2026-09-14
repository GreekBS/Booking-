import { NextRequest } from "next/server";
import { NotFoundError, ValidationError } from "@hcp/domain";
import { getChannelConnectionHealthUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ connectionId: string }> };

function assertOperatorApiEnabled(): void {
  if (!isChannelOperatorApiEnabled()) {
    throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
  }
}

/**
 * P1-S7b — derived connection health (no persisted health columns).
 * Never returns credentials, feed URLs, or raw ICS.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const tenantHeader = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantHeader);
    assertOperatorApiEnabled();

    const rawParams = await context.params;
    const connectionId = rawParams.connectionId?.trim() ?? "";
    if (!connectionId) {
      throw new ValidationError("connectionId is required");
    }

    const result = await getChannelConnectionHealthUseCase.execute(
      {
        tenantId: actor.tenantId,
        connectionId,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
