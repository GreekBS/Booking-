import { NextRequest } from "next/server";
import { deleteManualBlockUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ unitId: string; blockId: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { unitId, blockId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await deleteManualBlockUseCase.execute(
      {
        tenantId: actor.tenantId,
        unitId,
        blockId,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ deleted: true });
  } catch (error) {
    return apiError(error);
  }
}
