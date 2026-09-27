import { NextRequest } from "next/server";
import { renameCleaningLocationBodySchema } from "@hcp/validators";
import { renameCleaningLocationUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ locationId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { locationId } = await context.params;
    const body = renameCleaningLocationBodySchema.parse(await request.json());

    const result = await renameCleaningLocationUseCase.execute(
      {
        tenantId: actor.tenantId,
        locationId,
        name: body.name,
      },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );
    if (result.isFailure) return mapResultError(result.getError());

    const renamed = result.getValue();
    return apiSuccess({
      data: {
        id: renamed.id,
        propertyId: renamed.propertyId,
        name: renamed.name,
        status: renamed.status,
        sortOrder: renamed.sortOrder,
        commercialUnitId: renamed.commercialUnitId,
        updatedAt: renamed.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
