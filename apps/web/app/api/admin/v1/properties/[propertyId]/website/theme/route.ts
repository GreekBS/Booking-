import { NextRequest } from "next/server";
import { updateWebsiteThemeBodySchema } from "@hcp/validators";
import { updateWebsiteThemeUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeWebsite } from "@/lib/admin/website-serializers";

interface RouteParams {
  params: Promise<{ propertyId: string }>;
}

/** PATCH — update selected theme id (code registry; no render). */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;
    const body = updateWebsiteThemeBodySchema.parse(await request.json());

    const result = await updateWebsiteThemeUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId,
        themeId: body.themeId,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ website: serializeWebsite(result.getValue()) });
  } catch (error) {
    return apiError(error);
  }
}
