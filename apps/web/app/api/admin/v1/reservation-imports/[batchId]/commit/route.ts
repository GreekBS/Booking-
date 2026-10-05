import { NextRequest } from "next/server";
import { commitReservationImportBatchUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import {
  serializeReservationImportBatch,
  serializeReservationImportRow,
} from "@/lib/admin/reservation-import-serializers";

type RouteContext = { params: Promise<{ batchId: string }> };

/**
 * Phase C2 — atomic whole-batch commit.
 * No request body decisions; C1 use-case + TX remain authoritative.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { batchId } = await context.params;
    const result = await commitReservationImportBatchUseCase.execute(
      batchId,
      actor.tenantId,
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());
    const value = result.getValue();
    return apiSuccess({
      alreadyCompleted: value.alreadyCompleted,
      batch: serializeReservationImportBatch(value.batch),
      rows: value.rows.map(serializeReservationImportRow),
      summary: value.summary,
    });
  } catch (error) {
    return apiError(error);
  }
}
