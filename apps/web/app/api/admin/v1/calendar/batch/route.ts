import { NextRequest } from "next/server";
import { calendarBatchRequestSchema } from "@hcp/validators";
import { getUnitsCalendarBatchUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

/**
 * Batched unit calendars for Availability grid.
 * One request for many units — no per-unit HTTP fan-out.
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = calendarBatchRequestSchema.parse(await request.json());

    const result = await getUnitsCalendarBatchUseCase.execute(
      {
        tenantId: actor.tenantId,
        unitIds: body.unitIds,
        from: body.from,
        to: body.to,
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
