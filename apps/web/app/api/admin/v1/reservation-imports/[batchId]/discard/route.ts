import { NextRequest } from "next/server";
import { discardReservationImportDraftUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeReservationImportBatch } from "@/lib/admin/reservation-import-serializers";

type RouteContext = { params: Promise<{ batchId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { batchId } = await context.params;
    const result = await discardReservationImportDraftUseCase.execute(
      batchId,
      actor.tenantId,
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess({
      batch: serializeReservationImportBatch(result.getValue()),
    });
  } catch (error) {
    return apiError(error);
  }
}
