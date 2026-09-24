import { NextRequest } from "next/server";
import { getTenantDashboardOverviewUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { perfLog, perfNow } from "@/lib/perf-diag";

/**
 * Single-shot tenant dashboard overview.
 * Never fans out to per-booking quote fetches.
 */
export async function GET(request: NextRequest) {
  const totalStart = perfNow();
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const ctxStart = perfNow();
    const actor = await requireTenantContext(tenantId);
    perfLog("dashboard.overview.tenantContext", perfNow() - ctxStart);

    const propertyId =
      request.nextUrl.searchParams.get("propertyId") ?? undefined;

    const useCaseStart = perfNow();
    const result = await getTenantDashboardOverviewUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
      propertyId ? { propertyId } : undefined,
    );
    perfLog("dashboard.overview.useCase", perfNow() - useCaseStart);

    if (result.isFailure) {
      perfLog("dashboard.overview.total", perfNow() - totalStart, {
        outcome: "failure",
      });
      return mapResultError(result.getError());
    }

    perfLog("dashboard.overview.total", perfNow() - totalStart, {
      outcome: "ok",
    });
    return apiSuccess(result.getValue());
  } catch (error) {
    perfLog("dashboard.overview.total", perfNow() - totalStart, {
      outcome: "error",
    });
    return apiError(error);
  }
}
