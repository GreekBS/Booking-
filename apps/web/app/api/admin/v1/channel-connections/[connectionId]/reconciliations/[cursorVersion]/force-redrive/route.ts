import { NextRequest } from "next/server";
import { ForbiddenError, NotFoundError, ValidationError } from "@hcp/domain";
import { PERMISSIONS } from "@hcp/permissions";
import {
  auditLogRepository,
  forceRedrivePendingIcalInventoryReconcileUseCase,
  permissionChecker,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";
import { createLogger } from "@/lib/logging/logger";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ connectionId: string; cursorVersion: string }>;
};

const logger = createLogger({ action: "channels.force_redrive_reconcile" });

function assertOperatorApiEnabled(): void {
  if (!isChannelOperatorApiEnabled()) {
    throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
  }
}

/**
 * P1-S7b — ForceRedrive pending iCal inventory reconcile (dead_letter | cancelled).
 * Domain behavior remains in ForceRedrivePendingIcalInventoryReconcileUseCase.
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
    const cursorVersion = Number(rawParams.cursorVersion);
    if (!Number.isInteger(cursorVersion) || cursorVersion < 1) {
      throw new ValidationError("cursorVersion must be a positive integer");
    }

    const permissionActor = toPermissionActor(actor);
    if (
      !permissionChecker.hasPermission(
        permissionActor,
        PERMISSIONS.CHANNELS_CONNECTION_MANAGE,
        actor.tenantId,
      )
    ) {
      throw new ForbiddenError();
    }

    const contentType = request.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      const text = await request.text();
      if (text.trim().length > 0) {
        const body = JSON.parse(text) as unknown;
        if (body !== null && typeof body === "object" && Object.keys(body).length > 0) {
          throw new ValidationError("Request body must be empty");
        }
      }
    }

    const result = await forceRedrivePendingIcalInventoryReconcileUseCase.execute({
      tenantId: actor.tenantId,
      connectionId,
      cursorVersion,
      actorId: actor.userId,
    });

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const value = result.getValue();

    await auditLogRepository.append({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      action: "channel.connection.inventory_reconcile_force_redrive",
      resourceType: "ChannelInventoryReconciliation",
      resourceId: `${connectionId}:${cursorVersion}`,
      metadata: {
        connectionId,
        cursorVersion,
        predecessorJobId: value.predecessorJobId,
        successorJobId: value.jobId,
        idempotencyKey: value.idempotencyKey,
        previousJobStatus: value.previousJobStatus ?? null,
      },
      ipAddress: getClientIp(request),
    });

    logger.info("force redrive enqueued", {
      tenantId: actor.tenantId,
      connectionId,
      cursorVersion,
      jobId: value.jobId,
      actorId: actor.userId,
    });

    return apiSuccess({
      jobId: value.jobId,
      predecessorJobId: value.predecessorJobId,
      cursorVersion,
    });
  } catch (error) {
    return apiError(error);
  }
}
