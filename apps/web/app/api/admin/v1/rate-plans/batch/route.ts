import { NextRequest } from "next/server";
import { unitIdsBatchRequestSchema } from "@hcp/validators";
import { getUnitsRatePlansBatchUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

/**
 * Batched rate plans for Availability overlays / editors.
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = unitIdsBatchRequestSchema.parse(await request.json());

    const result = await getUnitsRatePlansBatchUseCase.execute(
      {
        tenantId: actor.tenantId,
        unitIds: body.unitIds,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ units: result.getValue() });
  } catch (error) {
    return apiError(error);
  }
}
