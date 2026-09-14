import { NextRequest } from "next/server";
import { createAmenitySchema } from "@hcp/validators";
import {
  listAmenitiesUseCase,
  createAmenityUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await listAmenitiesUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ data: result.getValue() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = createAmenitySchema.parse(await request.json());

    const result = await createAmenityUseCase.execute(
      {
        tenantId: actor.tenantId,
        ...body,
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
