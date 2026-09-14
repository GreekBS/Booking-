import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { ratePlanSchema } from "@hcp/validators";
import { configureRatePlanUseCase, getRatePlanUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ unitId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { unitId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await getRatePlanUseCase.execute(
      actor.tenantId,
      unitId,
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

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { unitId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const ratePlan = ratePlanSchema.parse(await request.json());

    const result = await configureRatePlanUseCase.execute(
      {
        tenantId: actor.tenantId,
        unitId,
        ratePlan: {
          ...ratePlan,
          seasons: ratePlan.seasons.map((season) => ({
            ...season,
            id: season.id ?? randomUUID(),
          })),
        },
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
