import { NextRequest } from "next/server";
import { createHoldSchema, listHoldsQuerySchema } from "@hcp/validators";
import { createHoldUseCase, listHoldsUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  serializeHold,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const query = listHoldsQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await listHoldsUseCase.execute(
      actor.tenantId,
      {
        unitId: query.unitId,
        propertyId: query.propertyId,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ data: result.getValue().map(serializeHold) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = createHoldSchema.parse(await request.json());

    const result = await createHoldUseCase.execute(
      {
        tenantId: actor.tenantId,
        ...body,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeHold(result.getValue()), 201);
  } catch (error) {
    return apiError(error);
  }
}
