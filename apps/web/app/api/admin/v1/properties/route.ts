import { NextRequest } from "next/server";
import { createPropertySchema, paginationSchema } from "@hcp/validators";
import {
  createPropertyUseCase,
  listPropertiesUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  serializeProperty,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const params = paginationSchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await listPropertiesUseCase.execute(
      actor.tenantId,
      params,
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const page = result.getValue();
    return apiSuccess({
      data: page.data.map(serializeProperty),
      meta: {
        total: page.total,
        page: page.page,
        limit: page.limit,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = createPropertySchema.parse(await request.json());

    const result = await createPropertyUseCase.execute(
      {
        tenantId: actor.tenantId,
        ...body,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeProperty(result.getValue()), 201);
  } catch (error) {
    return apiError(error);
  }
}
