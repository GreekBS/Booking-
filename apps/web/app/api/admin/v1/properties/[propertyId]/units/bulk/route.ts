import { NextRequest } from "next/server";
import { bulkCreateUnitsSchema } from "@hcp/validators";
import { bulkCreateUnitsUseCase } from "@/lib/di/container";
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
  roomTypeId: string | null;
  roomNumber: string | null;
  floor: string | null;
}) {
  return {
    id: unit.id,
    name: unit.name,
    slug: unit.slug,
    maxGuests: unit.maxGuests,
    bedrooms: unit.bedrooms,
    bathrooms: unit.bathrooms,
    status: unit.status,
    roomTypeId: unit.roomTypeId,
    roomNumber: unit.roomNumber,
    floor: unit.floor,
  };
}

/**
 * POST /api/admin/v1/properties/:propertyId/units/bulk
 * Atomically create N physical Units for a RoomType (preview=true for dry-run).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;
    const body = bulkCreateUnitsSchema.parse(await request.json());

    // Prefer header when present; never trust body tenant/property ids.
    const headerRequestId = request.headers.get("idempotency-key")?.trim() || null;

    const result = await bulkCreateUnitsUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId,
        roomTypeId: body.roomTypeId,
        numbering: body.numbering,
        floor: body.floor,
        bedrooms: body.bedrooms,
        bathrooms: body.bathrooms,
        preview: body.preview,
        clientRequestId: headerRequestId ?? body.clientRequestId ?? null,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const value = result.getValue();
    return apiSuccess(
      {
        preview: value.preview,
        clientRequestId: value.clientRequestId,
        planned: value.planned,
        units: value.units.map(serializeUnit),
        count: value.preview ? value.planned.length : value.units.length,
      },
      value.preview ? 200 : 201,
    );
  } catch (error) {
    return apiError(error);
  }
}
