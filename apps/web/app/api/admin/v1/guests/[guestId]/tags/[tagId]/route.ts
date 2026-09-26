import { NextRequest } from "next/server";
import {
  assignGuestTagUseCase,
  unassignGuestTagUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ guestId: string; tagId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { guestId, tagId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await assignGuestTagUseCase.execute(
      { tenantId: actor.tenantId, guestId, tagId },
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

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { guestId, tagId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await unassignGuestTagUseCase.execute(
      { tenantId: actor.tenantId, guestId, tagId },
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
