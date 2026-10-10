import { NextRequest } from "next/server";
import { previewBulkRatePlanFromTemplateSchema } from "@hcp/validators";
import { previewBulkRatePlanFromTemplateUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

/**
 * POST /api/admin/v1/properties/:propertyId/rate-plans/copy/preview
 * Preview bulk RatePlan copy from a template Unit (no writes).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;
    const body = previewBulkRatePlanFromTemplateSchema.parse(
      await request.json(),
    );

    const result = await previewBulkRatePlanFromTemplateUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId,
        sourceUnitId: body.sourceUnitId,
        targetUnitIds: body.targetUnitIds,
        roomTypeId: body.roomTypeId,
        mode: body.mode,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(result.getValue(), 200);
  } catch (error) {
    return apiError(error);
  }
}
