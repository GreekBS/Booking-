import { NextRequest } from "next/server";
import { resolveEscalationBodySchema } from "@hcp/validators";
import {
  loadPropertyAmenities,
  listOpenEscalationsUseCase,
  resolveOwnerEscalationUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import {
  serializeEscalation,
  serializeMessage,
} from "@/lib/admin/messaging-serializers";

interface RouteParams {
  params: Promise<{ escalationId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { escalationId } = await params;
    const body = resolveEscalationBodySchema.parse(await request.json());
    const permissionActor = toPermissionActor(actor);

    let amenities = body.amenities;
    if (!amenities) {
      const open = await listOpenEscalationsUseCase.execute(
        { tenantId: actor.tenantId, entireTenant: true },
        permissionActor,
      );
      const match = open.isSuccess
        ? open.getValue().find((e) => e.id === escalationId)
        : undefined;
      amenities = match
        ? await loadPropertyAmenities(actor.tenantId, match.propertyId)
        : [];
    }

    const result = await resolveOwnerEscalationUseCase.execute(
      {
        tenantId: actor.tenantId,
        escalationId,
        ownerReply: body.ownerReply,
        send: body.send,
        stay: body.stay,
        amenities,
      },
      permissionActor,
      { ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const value = result.getValue();
    return apiSuccess({
      escalation: serializeEscalation(value.escalation),
      draftText: value.draftText,
      sentMessage: value.sentMessage
        ? serializeMessage(value.sentMessage)
        : null,
      saveToKnowledgeOffered: value.saveToKnowledgeOffered,
    });
  } catch (error) {
    return apiError(error);
  }
}
