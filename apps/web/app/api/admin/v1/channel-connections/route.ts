import { NextRequest } from "next/server";
import { NotFoundError } from "@hcp/domain";
import { createChannelConnectionSchema } from "@hcp/validators";
import {
  createChannelConnectionUseCase,
  listChannelConnectionsUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";
import { serializeOperatorConnection } from "@/lib/channels/operator-connection-response";

function assertOperatorApiEnabled(): void {
  if (!isChannelOperatorApiEnabled()) {
    throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
  }
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    assertOperatorApiEnabled();

    const result = await listChannelConnectionsUseCase.execute(
      { tenantId: actor.tenantId },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({
      connections: result.getValue().map(serializeOperatorConnection),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    assertOperatorApiEnabled();

    const body = createChannelConnectionSchema.parse(await request.json());

    const result = await createChannelConnectionUseCase.execute(
      {
        tenantId: actor.tenantId,
        provider: body.provider,
        displayName: body.displayName,
        connectionId: body.connectionId,
      },
      toPermissionActor(actor),
      { actorId: actor.userId, ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeOperatorConnection(result.getValue()), 201);
  } catch (error) {
    return apiError(error);
  }
}
