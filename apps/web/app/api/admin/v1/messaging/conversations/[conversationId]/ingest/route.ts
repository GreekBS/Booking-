import { NextRequest } from "next/server";
import { ingestGuestMessageBodySchema } from "@hcp/validators";
import {
  getConversationThreadUseCase,
  ingestGuestMessageUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import {
  serializeConversation,
  serializeEscalation,
  serializeMessage,
  serializeSuggestion,
} from "@/lib/admin/messaging-serializers";
import { loadPropertyAmenityNames } from "@/lib/messaging/property-amenity-names";

interface RouteParams {
  params: Promise<{ conversationId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { conversationId } = await params;
    const body = ingestGuestMessageBodySchema.parse(await request.json());

    const threadPreview = await getConversationThreadUseCase.execute(
      { tenantId: actor.tenantId, conversationId },
      toPermissionActor(actor),
    );
    if (threadPreview.isFailure) {
      return mapResultError(threadPreview.getError());
    }
    const propertyId = threadPreview.getValue().conversation.propertyId;
    const amenityNames =
      body.amenityNames ??
      (await loadPropertyAmenityNames(actor.tenantId, propertyId));

    const result = await ingestGuestMessageUseCase.execute(
      {
        tenantId: actor.tenantId,
        conversationId,
        body: body.body,
        externalMessageId: body.externalMessageId,
        stay: body.stay,
        amenityNames,
      },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const value = result.getValue();
    return apiSuccess(
      {
        conversation: serializeConversation(value.conversation),
        inboundMessage: serializeMessage(value.inboundMessage),
        suggestion: value.suggestion
          ? serializeSuggestion(value.suggestion)
          : null,
        sentMessage: value.sentMessage
          ? serializeMessage(value.sentMessage)
          : null,
        escalation: value.escalation
          ? serializeEscalation(value.escalation)
          : null,
        autoSent: value.autoSent,
      },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
