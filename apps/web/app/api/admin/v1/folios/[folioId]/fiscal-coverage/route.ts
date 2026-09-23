import { NextRequest } from "next/server";
import { getFolioFiscalCoverageUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ folioId: string }> },
) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { folioId } = await context.params;
    const result = await getFolioFiscalCoverageUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
      folioId,
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
