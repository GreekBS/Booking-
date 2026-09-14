import { NextRequest } from "next/server";
import { createUnitSchema } from "@hcp/validators";
import { addUnitUseCase } from "@/lib/di/container";
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;
    const body = createUnitSchema.parse(await request.json());

    const result = await addUnitUseCase.execute(
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

    return apiSuccess(serializeUnit(result.getValue()), 201);
  } catch (error) {
    return apiError(error);
  }
}
