import { NextRequest } from "next/server";
import { updateRoomTypeSchema } from "@hcp/validators";
import {
  getRoomTypeUseCase,
  updateRoomTypeUseCase,
  deactivateRoomTypeUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

function serializeRoomType(roomType: {
  id: string;
  propertyId: string;
  name: string;
  code: string | null;
  description: string | null;
  maxGuests: number;
  maxAdults: number | null;
  maxChildren: number | null;
  status: string;
  sortOrder: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: roomType.id,
    propertyId: roomType.propertyId,
    name: roomType.name,
    code: roomType.code,
    description: roomType.description,
    maxGuests: roomType.maxGuests,
    maxAdults: roomType.maxAdults,
    maxChildren: roomType.maxChildren,
    status: roomType.status,
    sortOrder: roomType.sortOrder,
    deletedAt: roomType.deletedAt?.toISOString() ?? null,
    createdAt: roomType.createdAt.toISOString(),
    updatedAt: roomType.updatedAt.toISOString(),
  };
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ propertyId: string; roomTypeId: string }> },
) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId, roomTypeId } = await params;

    const result = await getRoomTypeUseCase.execute(
      actor.tenantId,
      propertyId,
      roomTypeId,
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeRoomType(result.getValue()));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ propertyId: string; roomTypeId: string }> },
) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId, roomTypeId } = await params;
    const body = updateRoomTypeSchema.parse(await request.json());

    const result = await updateRoomTypeUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId,
        roomTypeId,
        ...body,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeRoomType(result.getValue()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ propertyId: string; roomTypeId: string }> },
) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId, roomTypeId } = await params;

    const result = await deactivateRoomTypeUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId,
        roomTypeId,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const { roomType, linkedUnitCount } = result.getValue();
    return apiSuccess({
      ...serializeRoomType(roomType),
      deactivated: true,
      linkedUnitCount,
    });
  } catch (error) {
    return apiError(error);
  }
}
