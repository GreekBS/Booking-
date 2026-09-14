import { NextRequest } from "next/server";
import { generateInviteToken, resendInvitationUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor, getClientIp } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token: invitationId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { token, tokenHash } = generateInviteToken();

    const result = await resendInvitationUseCase.execute(
      {
        tenantId: actor.tenantId,
        invitationId,
        tokenHash,
        rawToken: token,
      },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({
      invitationId: result.getValue().invitationId,
      expiresAt: result.getValue().expiresAt.toISOString(),
    });
  } catch (error) {
    return apiError(error);
  }
}
