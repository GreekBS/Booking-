import { NextRequest } from "next/server";
import { NotFoundError } from "@hcp/domain";
import { setChannelConnectionSemanticModeSchema } from "@hcp/validators";
import {
  getChannelConnectionSemanticConfigurationUseCase,
  setChannelConnectionSemanticModeUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelSemanticModeApiEnabled } from "@/lib/channels/semantic-mode-api";
import { ValidationError } from "@hcp/domain";

type RouteContext = { params: Promise<{ connectionId: string }> };

function assertSemanticModeApiEnabled(): void {
  if (!isChannelSemanticModeApiEnabled()) {
    throw new NotFoundError("ChannelConnectionSemanticModeApi", "disabled");
  }
}

function assertIdempotencyKeyMatches(
  request: NextRequest,
  commandId: string,
): void {
  const header = request.headers.get("idempotency-key");
  if (header == null || header.trim().length === 0) {
    return;
  }
  if (header.trim() !== commandId) {
    throw new ValidationError(
      "Idempotency-Key header must equal body.commandId when provided",
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { connectionId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    assertSemanticModeApiEnabled();

    const result = await getChannelConnectionSemanticConfigurationUseCase.execute(
      {
        tenantId: actor.tenantId,
        connectionId,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const value = result.getValue();
    return apiSuccess({
      connectionId: value.connectionId,
      provider: value.provider,
      lifecycleStatus: value.lifecycleStatus,
      semanticMode: value.semanticMode,
      semanticConfigVersion: value.semanticConfigVersion,
      allowedSemanticModes: value.allowedSemanticModes,
      canDeclareReservationFeed: value.canDeclareReservationFeed,
      connectionUpdatedAt: value.connectionUpdatedAt.toISOString(),
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
    assertSemanticModeApiEnabled();

    const body = setChannelConnectionSemanticModeSchema.parse(await request.json());
    assertIdempotencyKeyMatches(request, body.commandId);

    const result = await setChannelConnectionSemanticModeUseCase.execute(
      {
        tenantId: actor.tenantId,
        connectionId,
        commandId: body.commandId,
        targetMode: body.targetMode,
        expectedSemanticConfigVersion: body.expectedSemanticConfigVersion,
        confirmation: body.confirmation,
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
