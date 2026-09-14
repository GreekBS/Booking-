import { NextRequest } from "next/server";
import { calendarQuerySchema } from "@hcp/validators";
import { getUnitCalendarUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ unitId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { unitId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const range = calendarQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await getUnitCalendarUseCase.execute(
      { tenantId: actor.tenantId, unitId, from: range.from, to: range.to },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
