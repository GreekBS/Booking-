import { NextRequest } from "next/server";
import { getUnitHousekeepingStatusUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { ValidationError } from "@hcp/domain";

type RouteContext = { params: Promise<{ unitId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { unitId } = await context.params;
    const propertyId = request.nextUrl.searchParams.get("propertyId");
    if (!propertyId) {
      return mapResultError(new ValidationError("propertyId is required"));
    }

    const result = await getUnitHousekeepingStatusUseCase.execute(
      { tenantId: actor.tenantId, propertyId, unitId },
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());
    const status = result.getValue();
    return apiSuccess({
      data: {
        unitId: status.unitId,
        tenantId: status.tenantId,
        propertyId: status.propertyId,
        status: status.status,
        source: status.source,
        updatedByUserId: status.updatedByUserId,
        updatedAt: status.updatedAt.toISOString(),
        version: status.version,
      },
    });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
