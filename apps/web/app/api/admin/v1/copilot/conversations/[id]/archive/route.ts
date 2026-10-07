import { NextRequest } from "next/server";
import { archiveCopilotConversationUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import {
  copilotIdParamSchema,
  toConversationDto,
} from "@/lib/copilot/copilot-api-schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Archive one of the authenticated operator's own conversations. */
export async function POST(request: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    const conversationId = copilotIdParamSchema.parse(id);
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await archiveCopilotConversationUseCase.execute(
      { tenantId: actor.tenantId, conversationId },
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess({ conversation: toConversationDto(result.getValue()) });
  } catch (error) {
    return apiError(error);
  }
}
