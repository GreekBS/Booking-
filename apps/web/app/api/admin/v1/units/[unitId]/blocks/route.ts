import { NextRequest } from "next/server";
import { createManualBlockSchema } from "@hcp/validators";
import { createManualBlockUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ unitId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { unitId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = createManualBlockSchema.parse(await request.json());

    const result = await createManualBlockUseCase.execute(
      {
        tenantId: actor.tenantId,
        unitId,
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        blockType: body.blockType,
        reason: body.reason,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(result.getValue(), 201);
  } catch (error) {
    return apiError(error);
  }
}
