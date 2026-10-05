import { NextRequest } from "next/server";
import { updateReservationImportBatchSchema } from "@hcp/validators";
import {
  getReservationImportDraftUseCase,
  updateReservationImportMissingPriceStrategyUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import {
  serializeReservationImportBatch,
  serializeReservationImportRejectedRow,
  serializeReservationImportRow,
} from "@/lib/admin/reservation-import-serializers";

type RouteContext = { params: Promise<{ batchId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { batchId } = await context.params;
    const result = await getReservationImportDraftUseCase.execute(
      batchId,
      actor.tenantId,
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());
    const value = result.getValue();
    return apiSuccess({
      batch: serializeReservationImportBatch(value.batch),
      rows: value.rows.map(serializeReservationImportRow),
      rejectedRows: value.rejectedRows.map(serializeReservationImportRejectedRow),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { batchId } = await context.params;
    const body = updateReservationImportBatchSchema.parse(await request.json());
    const result = await updateReservationImportMissingPriceStrategyUseCase.execute(
      {
        batchId,
        tenantId: actor.tenantId,
        missingPriceStrategy: body.missingPriceStrategy,
      },
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());
    const value = result.getValue();
    return apiSuccess({
      batch: serializeReservationImportBatch(value.batch),
      rows: value.rows.map(serializeReservationImportRow),
    });
  } catch (error) {
    return apiError(error);
  }
}
