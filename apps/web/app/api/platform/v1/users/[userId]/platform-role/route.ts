import { NextRequest } from "next/server";
import { z } from "zod";
import { changePlatformSuperAdminRoleUseCase } from "@/lib/di/container";
import { requireSuperAdmin, getClientIp } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

const bodySchema = z.object({
  action: z.enum(["promote", "demote"]),
});

type Params = { params: Promise<{ userId: string }> };

/**
 * Restrained Super Admin promote/demote — delegates exclusively to
 * ChangePlatformSuperAdminRoleUseCase (advisory lock + last-SA + audit).
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const actor = await requireSuperAdmin();
    const { userId } = await params;
    const body = bodySchema.parse(await request.json());

    const result = await changePlatformSuperAdminRoleUseCase.execute({
      targetUserId: userId,
      actorId: actor.userId,
      action: body.action,
      ipAddress: getClientIp(request),
    });

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ ok: true, action: body.action, userId });
  } catch (error) {
    return apiError(error);
  }
}
