import { NextRequest } from "next/server";
import { getHousekeepingTodayUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { ValidationError } from "@hcp/domain";

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const propertyId = request.nextUrl.searchParams.get("propertyId");
    if (!propertyId) {
      return mapResultError(new ValidationError("propertyId is required"));
    }

    const result = await getHousekeepingTodayUseCase.execute(
      { tenantId: actor.tenantId, propertyId },
      toPermissionActor(actor),
    );
    if (result.isFailure) {
      return mapResultError(result.getError());
    }
    return apiSuccess({ data: result.getValue() });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
