import { NextRequest } from "next/server";
import { releaseHoldUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ holdId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { holdId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await releaseHoldUseCase.execute(
      {
        tenantId: actor.tenantId,
        holdId,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ released: true });
  } catch (error) {
    return apiError(error);
  }
}
