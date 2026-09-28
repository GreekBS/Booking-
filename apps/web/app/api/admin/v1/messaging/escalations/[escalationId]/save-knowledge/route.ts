import { NextRequest } from "next/server";
import { saveEscalationKnowledgeBodySchema } from "@hcp/validators";
import { saveEscalationToKnowledgeUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeKnowledge } from "@/lib/admin/messaging-serializers";

interface RouteParams {
  params: Promise<{ escalationId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { escalationId } = await params;
    const body = saveEscalationKnowledgeBodySchema.parse(await request.json());

    const result = await saveEscalationToKnowledgeUseCase.execute(
      {
        tenantId: actor.tenantId,
        escalationId,
        confirm: body.confirm,
        patch: body.patch,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({
      knowledge: serializeKnowledge(result.getValue()),
    });
  } catch (error) {
    return apiError(error);
  }
}
