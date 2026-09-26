import { NextRequest } from "next/server";
import { markHousekeepingBodySchema } from "@hcp/validators";
import { markUnitDirtyUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ unitId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { unitId } = await context.params;
    const body = markHousekeepingBodySchema.parse(await request.json());

    const result = await markUnitDirtyUseCase.execute(
      {
        tenantId: actor.tenantId,
        unitId,
        propertyId: body.propertyId,
        expectedVersion: body.expectedVersion,
      },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );
    if (result.isFailure) return mapResultError(result.getError());
    const status = result.getValue();
    return apiSuccess({
      data: {
        unitId: status.unitId,
        status: status.status,
        source: status.source,
        version: status.version,
        updatedAt: status.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
