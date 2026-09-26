import { NextRequest } from "next/server";
import {
  cleaningTemplateQuerySchema,
  upsertCleaningTemplateBodySchema,
} from "@hcp/validators";
import {
  getCleaningChecklistTemplateUseCase,
  upsertCleaningChecklistTemplateUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeCleaningTemplate } from "@/lib/admin/cleaning-serializers";

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const query = cleaningTemplateQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await getCleaningChecklistTemplateUseCase.execute(
      { tenantId: actor.tenantId, propertyId: query.propertyId },
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());

    const template = result.getValue();
    return apiSuccess({
      data: template ? serializeCleaningTemplate(template) : null,
    });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function PUT(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = upsertCleaningTemplateBodySchema.parse(await request.json());

    const result = await upsertCleaningChecklistTemplateUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId: body.propertyId,
        name: body.name,
        minimumCompletionPhotos: body.minimumCompletionPhotos,
        items: body.items,
      },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );
    if (result.isFailure) return mapResultError(result.getError());

    return apiSuccess({ data: serializeCleaningTemplate(result.getValue()) });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
