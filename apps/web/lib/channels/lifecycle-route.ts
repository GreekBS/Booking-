import { NextRequest } from "next/server";
import {
  NotFoundError,
  type ActorContext,
  type Result,
  type UseCaseAuditContext,
} from "@hcp/domain";
import { channelConnectionLifecycleCommandSchema } from "@hcp/validators";
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

type LifecycleUseCase = {
  execute: (
    command: {
      tenantId: string;
      connectionId: string;
      expectedSemanticConfigVersion: number;
      correlationId?: string;
    },
    actor: ActorContext,
    audit: UseCaseAuditContext,
  ) => Promise<Result<unknown, Error>>;
};

export async function handleChannelConnectionLifecyclePost(
  request: NextRequest,
  context: RouteContext,
  useCase: LifecycleUseCase,
): Promise<Response> {
  try {
    const { connectionId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    assertOperatorApiEnabled();

    const body = channelConnectionLifecycleCommandSchema.parse(await request.json());

    const result = await useCase.execute(
      {
        tenantId: actor.tenantId,
        connectionId,
        expectedSemanticConfigVersion: body.expectedSemanticConfigVersion,
        correlationId: body.correlationId,
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
