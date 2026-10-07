import { NextRequest } from "next/server";
import { sendCopilotMessageUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import {
  copilotIdParamSchema,
  sendCopilotMessageBodySchema,
  toMessageDto,
} from "@/lib/copilot/copilot-api-schemas";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Send one operator message and run a read-only Copilot turn.
 *
 * Identity (tenant, user, role, property scope) always comes from the
 * authenticated session. `activePropertyId` and `pageContext` are HINTS that
 * the orchestrator re-authorizes; they never widen access.
 */
export async function POST(request: NextRequest, context: Ctx) {
  try {
    const { id } = await context.params;
    const conversationId = copilotIdParamSchema.parse(id);
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const body = sendCopilotMessageBodySchema.parse(
      await request.json().catch(() => undefined),
    );

    const result = await sendCopilotMessageUseCase.execute(
      {
        tenantId: actor.tenantId,
        conversationId,
        message: body.content,
        activePropertyId: body.activePropertyId ?? null,
        pageContext: body.pageContext ?? null,
      },
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());

    const turn = result.getValue();
    return apiSuccess({
      conversationId: turn.conversationId,
      operatorMessage: toMessageDto(turn.operatorMessage),
      assistantMessage: toMessageDto(turn.assistantMessage),
      toolCallCount: turn.toolCallCount,
      failed: turn.failed,
      errorCode: turn.errorCode,
    });
  } catch (error) {
    return apiError(error);
  }
}
