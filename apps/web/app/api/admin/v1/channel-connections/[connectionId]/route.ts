import { NextRequest } from "next/server";
import { NotFoundError } from "@hcp/domain";
import { updateChannelConnectionMetadataSchema } from "@hcp/validators";
import {
  getChannelConnectionUseCase,
  updateChannelConnectionMetadataUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";
import { serializeOperatorConnection } from "@/lib/channels/operator-connection-response";

type RouteContext = { params: Promise<{ connectionId: string }> };

function assertOperatorApiEnabled(): void {
  if (!isChannelOperatorApiEnabled()) {
    throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { connectionId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    assertOperatorApiEnabled();

    const result = await getChannelConnectionUseCase.execute(
      {
        tenantId: actor.tenantId,
        connectionId,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeOperatorConnection(result.getValue()));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { connectionId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    assertOperatorApiEnabled();

    const body = updateChannelConnectionMetadataSchema.parse(await request.json());

    const result = await updateChannelConnectionMetadataUseCase.execute(
      {
        tenantId: actor.tenantId,
        connectionId,
        displayName: body.displayName,
      },
      toPermissionActor(actor),
      { actorId: actor.userId, ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeOperatorConnection(result.getValue()));
  } catch (error) {
    return apiError(error);
  }
}
