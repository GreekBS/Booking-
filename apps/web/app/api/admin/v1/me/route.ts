import { patchMeSchema } from "@hcp/validators";
import {
  getMeUseCase,
  impersonateTenantUseCase,
  resolveTenantContextUseCase,
} from "@/lib/di/container";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { requireSession, getClientIp } from "@/lib/tenant-context";

export async function GET() {
  try {
    const actor = await requireSession();
    const result = await getMeUseCase.execute(actor.userId, actor.activeTenantId);

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireSession();
    const body = patchMeSchema.parse(await request.json());

    if (!body.activeTenantId) {
      return apiError(new Error("activeTenantId required"));
    }

    const access = await resolveTenantContextUseCase.execute({
      userId: actor.userId,
      platformRole: actor.platformRole,
      tenantId: body.activeTenantId,
    });

    if (access.isFailure) {
      return mapResultError(access.getError());
    }

    const result = await impersonateTenantUseCase.execute(
      actor.userId,
      body.activeTenantId,
      { actorId: actor.userId, ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ activeTenantId: body.activeTenantId });
  } catch (error) {
    return apiError(error);
  }
}
