import { NextRequest } from "next/server";
import { sendOperatorMessageBodySchema } from "@hcp/validators";
import { sendOperatorMessageUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeMessage } from "@/lib/admin/messaging-serializers";

interface RouteParams {
  params: Promise<{ conversationId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { conversationId } = await params;
    const body = sendOperatorMessageBodySchema.parse(await request.json());

    const result = await sendOperatorMessageUseCase.execute(
      {
        tenantId: actor.tenantId,
        conversationId,
        body: body.body,
        aiSuggestionId: body.aiSuggestionId,
        suggestionStatus: body.suggestionStatus,
      },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeMessage(result.getValue()), 201);
  } catch (error) {
    return apiError(error);
  }
}
