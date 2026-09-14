import { NextRequest } from "next/server";
import { NotFoundError } from "@hcp/domain";
import { putChannelConnectionWebhookVerificationSchema } from "@hcp/validators";
import { putChannelConnectionWebhookVerificationUseCase } from "@/lib/di/container";
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

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { connectionId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    assertOperatorApiEnabled();

    const body = putChannelConnectionWebhookVerificationSchema.parse(
      await request.json(),
    );

    const result = await putChannelConnectionWebhookVerificationUseCase.execute(
      {
        tenantId: actor.tenantId,
        connectionId,
        secret: body.secret,
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
