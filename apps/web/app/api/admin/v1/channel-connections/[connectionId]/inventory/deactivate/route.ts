import { NextRequest } from "next/server";
import { NotFoundError, ValidationError } from "@hcp/domain";
import { deactivateChannelConnectionInventoryUseCase } from "@/lib/di/container";
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

const logger = createLogger({ action: "channels.inventory_deactivate" });

function assertOperatorApiEnabled(): void {
  if (!isChannelOperatorApiEnabled()) {
    throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
  }
}

/**
 * P1-S7b — emergency inventory rollback:
 * pause connection (if active) + release ALL active channel_import for the connection.
 * Does not change disconnect semantics.
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

    let expectedSemanticConfigVersion: number | undefined;
    const contentType = request.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      const text = await request.text();
      if (text.trim().length > 0) {
        const body = JSON.parse(text) as {
          expectedSemanticConfigVersion?: unknown;
        };
        if (
          body.expectedSemanticConfigVersion !== undefined &&
          (!Number.isInteger(body.expectedSemanticConfigVersion) ||
            (body.expectedSemanticConfigVersion as number) < 1)
        ) {
          throw new ValidationError(
            "expectedSemanticConfigVersion must be a positive integer",
          );
        }
        expectedSemanticConfigVersion =
          body.expectedSemanticConfigVersion as number | undefined;
      }
    }

    const result = await deactivateChannelConnectionInventoryUseCase.execute(
      {
        tenantId: actor.tenantId,
        connectionId,
        expectedSemanticConfigVersion,
      },
      toPermissionActor(actor),
      { actorId: actor.userId, ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const value = result.getValue();
    logger.info("inventory deactivate applied", {
      tenantId: actor.tenantId,
      connectionId,
      releasedCount: value.releasedCount,
      alreadyPaused: value.alreadyPaused,
      actorId: actor.userId,
    });

    return apiSuccess({
      connectionId: value.connectionId,
      connectionStatus: value.connectionStatus,
      releasedCount: value.releasedCount,
      alreadyPaused: value.alreadyPaused,
      semanticConfigVersion: value.semanticConfigVersion,
    });
  } catch (error) {
    return apiError(error);
  }
}
