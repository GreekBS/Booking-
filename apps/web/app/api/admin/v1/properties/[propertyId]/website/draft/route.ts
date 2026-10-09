import { NextRequest } from "next/server";
import { NotFoundError } from "@hcp/domain";
import { saveWebsiteDraftBodySchema } from "@hcp/validators";
import {
  getWebsiteUseCase,
  saveWebsiteDraftUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import {
  serializeWebsite,
  serializeWebsiteVersion,
} from "@/lib/admin/website-serializers";

interface RouteParams {
  params: Promise<{ propertyId: string }>;
}

/**
 * GET — read current draft version JSON (opaque sections; no HTML render).
 * PUT — validate + save draft content atomically.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;

    const result = await getWebsiteUseCase.execute(
      { tenantId: actor.tenantId, propertyId },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const { website, draft } = result.getValue();
    if (!draft) {
      return mapResultError(new NotFoundError("WebsiteVersion", "draft"));
    }

    return apiSuccess({
      website: serializeWebsite(website),
      draft: serializeWebsiteVersion(draft),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;
    const content = saveWebsiteDraftBodySchema.parse(await request.json());

    const result = await saveWebsiteDraftUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId,
        content,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const { website, draft } = result.getValue();
    return apiSuccess({
      website: serializeWebsite(website),
      draft: serializeWebsiteVersion(draft),
    });
  } catch (error) {
    return apiError(error);
  }
}
