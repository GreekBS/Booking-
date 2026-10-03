import { NextRequest } from "next/server";
import { updateReservationImportRowDecisionSchema } from "@hcp/validators";
import { updateReservationImportRowDecisionUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeReservationImportRow } from "@/lib/admin/reservation-import-serializers";

type RouteContext = { params: Promise<{ batchId: string; rowId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { batchId, rowId } = await context.params;
    const body = updateReservationImportRowDecisionSchema.parse(await request.json());
    const result = await updateReservationImportRowDecisionUseCase.execute(
      {
        batchId,
        rowId,
        tenantId: actor.tenantId,
        conflictResolution: body.conflictResolution,
        priceSource: body.priceSource,
        operatorTotalAmount: body.operatorTotalAmount,
        operatorCurrency: body.operatorCurrency,
      },
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess({
      row: serializeReservationImportRow(result.getValue()),
    });
  } catch (error) {
    return apiError(error);
  }
}
