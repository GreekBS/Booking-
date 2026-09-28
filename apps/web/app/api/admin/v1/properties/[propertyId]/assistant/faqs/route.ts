import { NextRequest } from "next/server";
import { replaceFaqsBodySchema } from "@hcp/validators";
import { replacePropertyFaqsUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeFaq } from "@/lib/admin/messaging-serializers";

interface RouteParams {
  params: Promise<{ propertyId: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { propertyId } = await params;
    const body = replaceFaqsBodySchema.parse(await request.json());

    const result = await replacePropertyFaqsUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId,
        faqs: body.faqs,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({
      data: result.getValue().map(serializeFaq),
    });
  } catch (error) {
    return apiError(error);
  }
}
