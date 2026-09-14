import { NextRequest } from "next/server";
import { updateMemberSchema } from "@hcp/validators";
import {
  updateMemberUseCase,
  revokeMemberUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

interface RouteParams {
  params: Promise<{ membershipId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { membershipId } = await params;
    const body = updateMemberSchema.parse(await request.json());

    const result = await updateMemberUseCase.execute(
      {
        tenantId: actor.tenantId,
        membershipId,
        ...body,
      },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const membership = result.getValue();
    return apiSuccess({
      id: membership.id,
      userId: membership.userId,
      role: membership.role,
      status: membership.status,
      propertyIds: membership.propertyIds,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { membershipId } = await params;

    const result = await revokeMemberUseCase.execute(
      { tenantId: actor.tenantId, membershipId },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ id: membershipId, revoked: true });
  } catch (error) {
    return apiError(error);
  }
}
