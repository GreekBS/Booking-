import { NextRequest } from "next/server";
import { listCleaningHistoryQuerySchema } from "@hcp/validators";
import { listCleaningHistoryUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeCleaningHistoryEntry } from "@/lib/admin/cleaning-serializers";

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const query = listCleaningHistoryQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await listCleaningHistoryUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId: query.propertyId,
        unitId: query.unitId,
        entireTenant: query.entireTenant,
        page: query.page,
        limit: query.limit,
      },
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());

    const page = result.getValue();
    return apiSuccess({
      data: page.data.map(serializeCleaningHistoryEntry),
      page: page.page,
      limit: page.limit,
      total: page.total,
    });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
