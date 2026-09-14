import { NextRequest } from "next/server";
import { NotFoundError, ValidationError } from "@hcp/domain";
import { rotateIcalConnectionCredentialsSchema } from "@hcp/validators";
import { rotateIcalConnectionCredentialsUseCase } from "@/lib/di/container";
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

function assertIdempotencyKeyMatches(request: NextRequest, commandId: string): void {
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

/**
 * P1-S6c — rotate iCal feed credentials.
 *
 * The connection is paused and stays paused: rotation never auto-resumes.
 * Credential material is forwarded to the sealed vault only and never echoed.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { connectionId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    assertOperatorApiEnabled();

    const body = rotateIcalConnectionCredentialsSchema.parse(await request.json());
    assertIdempotencyKeyMatches(request, body.commandId);

    const result = await rotateIcalConnectionCredentialsUseCase.execute(
      {
        tenantId: actor.tenantId,
        connectionId,
        commandId: body.commandId,
        material: body.material,
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
