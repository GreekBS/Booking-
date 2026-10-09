import { NextRequest } from "next/server";
import { ensureWebsiteBodySchema } from "@hcp/validators";
import {
  ensureWebsiteUseCase,
  getWebsiteUseCase,
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
 * GET — load website + draft/published version snapshots for an authorized property.
 * POST — ensure (get-or-create) website + initial draft.
 *
 * tenantId always comes from the authenticated session context, never the body.
 * Responses are JSON only — richtext is never rendered as HTML.
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

    const { website, draft, published } = result.getValue();
    return apiSuccess({
      website: serializeWebsite(website),
      draft: draft ? serializeWebsiteVersion(draft) : null,
      published: published ? serializeWebsiteVersion(published) : null,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;
    const body = ensureWebsiteBodySchema.parse(
      await request.json().catch(() => ({})),
    );

    const result = await ensureWebsiteUseCase.execute(
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

    const { website, draft } = result.getValue();
    return apiSuccess({
      website: serializeWebsite(website),
      draft: serializeWebsiteVersion(draft),
    });
  } catch (error) {
    return apiError(error);
  }
}
