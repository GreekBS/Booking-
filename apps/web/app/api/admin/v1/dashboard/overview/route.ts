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
 *
 * Analytics period via search params (canonical):
 *   ?period=year&year=2026
 *   ?period=month&year=2026&month=10
 *   ?period=quarter&year=2026&quarter=4
 *   ?period=half&year=2026&half=2
 *   ?period=week&week=2026-09-28
 * Invalid/missing → Year / property-local current year.
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const params = request.nextUrl.searchParams;
    const propertyId = params.get("propertyId") ?? undefined;

    const result = await getTenantDashboardOverviewUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
      {
        propertyId,
        period: {
          period: params.get("period"),
          year: params.get("year"),
          month: params.get("month"),
          quarter: params.get("quarter"),
          half: params.get("half"),
          week: params.get("week"),
        },
      },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
