import { NextRequest } from "next/server";
import { upsertAssistantProfileBodySchema } from "@hcp/validators";
import {
  getPropertyAssistantConfigUseCase,
  upsertPropertyAssistantProfileUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import {
  serializeAssistantProfile,
  serializeFaq,
  serializeKnowledge,
} from "@/lib/admin/messaging-serializers";

interface RouteParams {
  params: Promise<{ propertyId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;

    const result = await getPropertyAssistantConfigUseCase.execute(
      { tenantId: actor.tenantId, propertyId },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const config = result.getValue();
    return apiSuccess({
      profile: serializeAssistantProfile(config.profile),
      knowledge: serializeKnowledge(config.knowledge),
      faqs: config.faqs.map(serializeFaq),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;
    const body = upsertAssistantProfileBodySchema.parse(await request.json());

    const result = await upsertPropertyAssistantProfileUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId,
        ...body,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeAssistantProfile(result.getValue()));
  } catch (error) {
    return apiError(error);
  }
}
