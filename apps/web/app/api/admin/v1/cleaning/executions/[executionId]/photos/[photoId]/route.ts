import { NextRequest } from "next/server";
import { removeCleaningPhotoUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = {
  params: Promise<{ executionId: string; photoId: string }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { executionId, photoId } = await context.params;

    const result = await removeCleaningPhotoUseCase.execute(
      { tenantId: actor.tenantId, executionId, photoId },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess({ data: result.getValue() });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
