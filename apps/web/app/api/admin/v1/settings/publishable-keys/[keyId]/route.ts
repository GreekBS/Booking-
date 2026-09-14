import { NextRequest } from "next/server";
import { updatePublishableKeyDomainsSchema } from "@hcp/validators";
import {
  revokePublishableKeyUseCase,
  updatePublishableKeyDomainsUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ keyId: string }> };

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { keyId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await revokePublishableKeyUseCase.execute(
      { tenantId: actor.tenantId, keyId },
      toPermissionActor(actor),
      { actorId: actor.userId, ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ revoked: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { keyId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = updatePublishableKeyDomainsSchema.parse(await request.json());

    const result = await updatePublishableKeyDomainsUseCase.execute(
      {
        tenantId: actor.tenantId,
        keyId,
        allowedDomains: body.allowedDomains,
      },
      toPermissionActor(actor),
      { actorId: actor.userId, ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const key = result.getValue();
    return apiSuccess({
      id: key.id,
      keyPrefix: key.keyPrefix,
      environment: key.environment,
      allowedDomains: key.allowedDomains,
      isActive: key.isActive,
      createdAt: key.createdAt.toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
