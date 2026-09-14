import { NextRequest } from "next/server";
import { NotFoundError, ValidationError } from "@hcp/domain";
import { disableChannelConnectionInventoryApplyUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";
import { createLogger } from "@/lib/logging/logger";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ connectionId: string }> };

const logger = createLogger({ action: "channels.inventory_apply_disable" });

function assertOperatorApiEnabled(): void {
  if (!isChannelOperatorApiEnabled()) {
    throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
  }
}

/**
 * P1-S7c — disable connection-scoped inventory apply fence.
 * Does not pause, release inventory, or supersede pending reconciliations.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const tenantHeader = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantHeader);
    assertOperatorApiEnabled();

    const rawParams = await context.params;
    const connectionId = rawParams.connectionId?.trim() ?? "";
    if (!connectionId) {
      throw new ValidationError("connectionId is required");
    }

    const contentType = request.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      throw new ValidationError("application/json body with expectedSemanticConfigVersion is required");
    }
    const body = (await request.json()) as {
      expectedSemanticConfigVersion?: unknown;
    };
    if (
      !Number.isInteger(body.expectedSemanticConfigVersion) ||
      (body.expectedSemanticConfigVersion as number) < 1
    ) {
      throw new ValidationError("expectedSemanticConfigVersion must be a positive integer");
    }

    const result = await disableChannelConnectionInventoryApplyUseCase.execute(
      {
        tenantId: actor.tenantId,
        connectionId,
        expectedSemanticConfigVersion: body.expectedSemanticConfigVersion as number,
      },
      toPermissionActor(actor),
      { actorId: actor.userId, ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const value = result.getValue();
    logger.info("inventory apply disabled", {
      tenantId: actor.tenantId,
      connectionId,
      alreadyDisabled: value.alreadyDisabled,
      actorId: actor.userId,
    });

    return apiSuccess({
      connectionId: value.connectionId,
      inventoryApplyEnabled: value.inventoryApplyEnabled,
      alreadyDisabled: value.alreadyDisabled,
      semanticConfigVersion: value.semanticConfigVersion,
    });
  } catch (error) {
    return apiError(error);
  }
}
