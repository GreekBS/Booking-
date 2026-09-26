import { NextRequest } from "next/server";
import { getTenantDashboardOverviewUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

/**
 * Single-shot tenant dashboard overview.
 * Never fans out to per-booking quote fetches.
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const propertyId =
      request.nextUrl.searchParams.get("propertyId") ?? undefined;

    const result = await getTenantDashboardOverviewUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
      propertyId ? { propertyId } : undefined,
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
