import { NextRequest } from "next/server";
import { bulkInitializeCleaningLocationsBodySchema } from "@hcp/validators";
import { bulkInitializeCleaningLocationsUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = bulkInitializeCleaningLocationsBodySchema.parse(
      await request.json(),
    );

    const result = await bulkInitializeCleaningLocationsUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId: body.propertyId,
        count: body.count,
      },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );
    if (result.isFailure) return mapResultError(result.getError());

    const created = result.getValue();
    return apiSuccess(
      {
        data: created.map((row) => ({
          id: row.id,
          propertyId: row.propertyId,
          name: row.name,
          status: row.status,
          sortOrder: row.sortOrder,
        })),
      },
      201,
    );
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
