import { NextRequest } from "next/server";
import { applyBulkRatePlanFromTemplateSchema } from "@hcp/validators";
import { applyBulkRatePlanFromTemplateUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

/**
 * POST /api/admin/v1/properties/:propertyId/rate-plans/apply-from-template
 * Apply confirmed bulk RatePlan copy (atomic; never reprices existing bookings).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;
    const body = applyBulkRatePlanFromTemplateSchema.parse(
      await request.json(),
    );

    const result = await applyBulkRatePlanFromTemplateUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId,
        confirmationToken: body.confirmationToken,
        confirmOverwrite: body.confirmOverwrite,
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
