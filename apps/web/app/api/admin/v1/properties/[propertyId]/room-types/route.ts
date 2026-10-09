import { NextRequest } from "next/server";
import { createRoomTypeSchema } from "@hcp/validators";
import {
  createRoomTypeUseCase,
  listRoomTypesUseCase,
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
  { params }: { params: Promise<{ propertyId: string }> },
) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;
    const includeDeleted =
      request.nextUrl.searchParams.get("includeDeleted") === "true";

    const result = await listRoomTypesUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId,
        includeDeleted,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({
      roomTypes: result.getValue().map(serializeRoomType),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ propertyId: string }> },
) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;
    const body = createRoomTypeSchema.parse(await request.json());

    const result = await createRoomTypeUseCase.execute(
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

    return apiSuccess(serializeRoomType(result.getValue()), 201);
  } catch (error) {
    return apiError(error);
  }
}
