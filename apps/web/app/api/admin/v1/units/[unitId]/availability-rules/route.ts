import { NextRequest } from "next/server";
import { availabilityRulesSchema } from "@hcp/validators";
import {
  configureAvailabilityRulesUseCase,
  getAvailabilityRulesUseCase,
} from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ unitId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { unitId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await getAvailabilityRulesUseCase.execute(
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
    const rules = availabilityRulesSchema.parse(await request.json());

    const result = await configureAvailabilityRulesUseCase.execute(
      {
        tenantId: actor.tenantId,
        unitId,
        rules,
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
