import { NextRequest } from "next/server";
import { getCopilotConversationUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import {
  copilotIdParamSchema,
  toConversationDto,
  toMessageDto,
  type CopilotMessageDto,
} from "@/lib/copilot/copilot-api-schemas";

type Ctx = { params: Promise<{ id: string }> };

/** Conversation + transcript. Non-owners receive 404 (existence never leaks). */
export async function GET(request: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    const conversationId = copilotIdParamSchema.parse(id);
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await getCopilotConversationUseCase.execute(
      { tenantId: actor.tenantId, conversationId },
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());

    const { conversation, messages } = result.getValue();
    return apiSuccess({
      conversation: toConversationDto(conversation),
      messages: messages
        .map(toMessageDto)
        .filter((m): m is CopilotMessageDto => m !== null),
    });
  } catch (error) {
    return apiError(error);
  }
}
