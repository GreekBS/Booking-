import { NextRequest } from "next/server";
import {
  createConversationBodySchema,
  listConversationsQuerySchema,
} from "@hcp/validators";
import {
  createConversationUseCase,
  listConversationsUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeConversation } from "@/lib/admin/messaging-serializers";

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const query = listConversationsQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await listConversationsUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId: query.propertyId,
        entireTenant: query.entireTenant,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({
      data: result.getValue().map(serializeConversation),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = createConversationBodySchema.parse(await request.json());

    const result = await createConversationUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId: body.propertyId,
        guestId: body.guestId,
        bookingId: body.bookingId,
        subject: body.subject,
        channel: body.channel,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    void getClientIp(request);
    return apiSuccess(serializeConversation(result.getValue()), 201);
  } catch (error) {
    return apiError(error);
  }
}
