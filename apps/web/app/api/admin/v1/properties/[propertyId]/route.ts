import { NextRequest } from "next/server";
import { updatePropertySchema } from "@hcp/validators";
import {
  updatePropertyUseCase,
  getPropertyUseCase,
  archivePropertyUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  serializeProperty,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

interface RouteParams {
  params: Promise<{ propertyId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;

    const result = await getPropertyUseCase.execute(
      actor.tenantId,
      propertyId,
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeProperty(result.getValue()));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;
    const body = updatePropertySchema.parse(await request.json());

    const result = await updatePropertyUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId,
        ...body,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeProperty(result.getValue()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;

    const result = await archivePropertyUseCase.execute(
      { tenantId: actor.tenantId, propertyId },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ id: propertyId, archived: true });
  } catch (error) {
    return apiError(error);
  }
}
