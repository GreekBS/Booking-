import { NextRequest } from "next/server";
import { updateUnitSchema } from "@hcp/validators";
import {
  getUnitUseCase,
  updateUnitUseCase,
  removeUnitUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

function serializeUnit(unit: {
  id: string;
  name: string;
  slug: string;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  status: string;
}) {
  return {
    id: unit.id,
    name: unit.name,
    slug: unit.slug,
    maxGuests: unit.maxGuests,
    bedrooms: unit.bedrooms,
    bathrooms: unit.bathrooms,
    status: unit.status,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string; unitId: string }> },
) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId, unitId } = await params;

    const result = await getUnitUseCase.execute(
      actor.tenantId,
      propertyId,
      unitId,
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeUnit(result.getValue()));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string; unitId: string }> },
) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId, unitId } = await params;
    const body = updateUnitSchema.parse(await request.json());

    const result = await updateUnitUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId,
        unitId,
        ...body,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeUnit(result.getValue()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string; unitId: string }> },
) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId, unitId } = await params;

    const result = await removeUnitUseCase.execute(
      { tenantId: actor.tenantId, propertyId, unitId },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ id: unitId, removed: true });
  } catch (error) {
    return apiError(error);
  }
}
