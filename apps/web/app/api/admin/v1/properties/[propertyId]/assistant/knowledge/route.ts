import { NextRequest } from "next/server";
import { upsertGuestKnowledgeBodySchema } from "@hcp/validators";
import { upsertPropertyGuestKnowledgeUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeKnowledge } from "@/lib/admin/messaging-serializers";

interface RouteParams {
  params: Promise<{ propertyId: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;
    const body = upsertGuestKnowledgeBodySchema.parse(await request.json());

    const result = await upsertPropertyGuestKnowledgeUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId,
        patch: body,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeKnowledge(result.getValue()));
  } catch (error) {
    return apiError(error);
  }
}
