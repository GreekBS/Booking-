import { NextRequest } from "next/server";
import { getConversationThreadUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import {
  serializeConversation,
  serializeEscalation,
  serializeMessage,
  serializeSuggestion,
} from "@/lib/admin/messaging-serializers";

interface RouteParams {
  params: Promise<{ conversationId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { conversationId } = await params;

    const result = await getConversationThreadUseCase.execute(
      { tenantId: actor.tenantId, conversationId },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const thread = result.getValue();
    return apiSuccess({
      conversation: serializeConversation(thread.conversation),
      messages: thread.messages.map(serializeMessage),
      suggestions: thread.suggestions.map(serializeSuggestion),
      openEscalations: thread.openEscalations.map(serializeEscalation),
    });
  } catch (error) {
    return apiError(error);
  }
}
