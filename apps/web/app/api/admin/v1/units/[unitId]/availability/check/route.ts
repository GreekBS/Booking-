import { NextRequest } from "next/server";
import { checkAvailabilitySchema } from "@hcp/validators";
import { checkAvailabilityUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ unitId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { unitId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = checkAvailabilitySchema.parse(await request.json());

    const result = await checkAvailabilityUseCase.execute(
      {
        tenantId: actor.tenantId,
        unitId,
        ...body,
      },
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
