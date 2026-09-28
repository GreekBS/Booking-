import { NextRequest } from "next/server";
import { listEscalationsQuerySchema } from "@hcp/validators";
import { listOpenEscalationsUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeEscalation } from "@/lib/admin/messaging-serializers";

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const query = listEscalationsQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await listOpenEscalationsUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId: query.propertyId,
        entireTenant: query.entireTenant,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({
      data: result.getValue().map(serializeEscalation),
    });
  } catch (error) {
    return apiError(error);
  }
}
