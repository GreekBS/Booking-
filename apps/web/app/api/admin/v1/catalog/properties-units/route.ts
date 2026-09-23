import { NextRequest } from "next/server";
import { listPropertyUnitCatalogUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

/**
 * Slim property/unit catalog for pickers and filters.
 * Excludes amenities, location, policies, and other heavy fields.
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await listPropertyUnitCatalogUseCase.execute(
      actor.tenantId,
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
