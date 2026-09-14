import { NextRequest } from "next/server";
import { inviteMemberSchema } from "@hcp/validators";
import {
  inviteMemberUseCase,
  listMembersUseCase,
  listPendingInvitationsUseCase,
  generateInviteToken,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const [membersResult, invitationsResult] = await Promise.all([
      listMembersUseCase.execute(actor.tenantId, toPermissionActor(actor)),
      listPendingInvitationsUseCase.execute(actor.tenantId, toPermissionActor(actor)),
    ]);

    if (membersResult.isFailure) {
      return mapResultError(membersResult.getError());
    }
    if (invitationsResult.isFailure) {
      return mapResultError(invitationsResult.getError());
    }

    return apiSuccess({
      data: membersResult.getValue(),
      pendingInvitations: invitationsResult.getValue().map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        propertyIds: invitation.propertyIds,
        expiresAt: invitation.expiresAt.toISOString(),
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = inviteMemberSchema.parse(await request.json());

    const { token, tokenHash } = generateInviteToken();

    const result = await inviteMemberUseCase.execute(
      {
        tenantId: actor.tenantId,
        email: body.email,
        role: body.role,
        propertyIds: body.propertyIds,
        invitedBy: actor.userId,
        tokenHash,
        rawToken: token,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(
      {
        id: result.getValue().invitation.id,
        email: body.email,
        role: body.role,
        expiresAt: result.getValue().invitation.expiresAt.toISOString(),
      },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
