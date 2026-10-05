import { NextRequest } from "next/server";
import { DomainError } from "@hcp/domain";
import { commitReservationImportBatchUseCase } from "@/lib/di/container";
import {
  getClientIp,
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import {
  serializeReservationImportBatch,
  serializeReservationImportRow,
} from "@/lib/admin/reservation-import-serializers";
import { createLogger } from "@/lib/logging/logger";

type RouteContext = { params: Promise<{ batchId: string }> };

const logger = createLogger({ action: "reservation_imports.commit" });

/**
 * Phase C2 — atomic whole-batch commit.
 * No request body decisions; C1 use-case + TX remain authoritative.
 * Phase C3 — structured observability only (no semantic change).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const startedAt = Date.now();
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { batchId } = await context.params;
    const result = await commitReservationImportBatchUseCase.execute(
      batchId,
      actor.tenantId,
      toPermissionActor(actor),
    );
    const durationMs = Date.now() - startedAt;

    if (result.isFailure) {
      const err = result.getError();
      logger.error("reservation import commit failed", {
        tenantId: actor.tenantId,
        batchId,
        actorId: actor.userId,
        durationMs,
        errorCode: err instanceof DomainError ? err.code : "INTERNAL_ERROR",
        errorName: err.name,
        ipAddress: getClientIp(request),
      });
      return mapResultError(err);
    }

    const value = result.getValue();
    logger.info("reservation import commit succeeded", {
      tenantId: actor.tenantId,
      batchId,
      actorId: actor.userId,
      alreadyCompleted: value.alreadyCompleted,
      imported: value.summary.imported,
      skipped: value.summary.skipped,
      replaced: value.summary.supersededBookingIds.length,
      durationMs,
      ipAddress: getClientIp(request),
    });

    return apiSuccess({
      alreadyCompleted: value.alreadyCompleted,
      batch: serializeReservationImportBatch(value.batch),
      rows: value.rows.map(serializeReservationImportRow),
      summary: value.summary,
    });
  } catch (error) {
    logger.error("reservation import commit failed", {
      durationMs: Date.now() - startedAt,
      errorCode: error instanceof DomainError ? error.code : "INTERNAL_ERROR",
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return apiError(error);
  }
}
