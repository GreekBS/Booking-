import { NextRequest } from "next/server";
import { archiveCleaningLocationUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ locationId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { locationId } = await context.params;

    const result = await archiveCleaningLocationUseCase.execute(
      { tenantId: actor.tenantId, locationId },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );
    if (result.isFailure) return mapResultError(result.getError());

    const archived = result.getValue();
    return apiSuccess({
      data: {
        id: archived.id,
        propertyId: archived.propertyId,
        name: archived.name,
        status: archived.status,
        archivedAt: archived.archivedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
