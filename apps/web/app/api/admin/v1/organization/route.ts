import { createOrganizationSchema } from "@hcp/validators";
import {
  createOrganizationForUserUseCase,
  impersonateTenantUseCase,
  resolveTenantContextUseCase,
} from "@/lib/di/container";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { getClientIp, requireSession, serializeTenant } from "@/lib/tenant-context";

/**
 * Self-serve organization create for authenticated customers.
 * Does not require an existing tenant context. Does not grant platform roles.
 */
export async function POST(request: Request) {
  try {
    const actor = await requireSession();
    const body = createOrganizationSchema.parse(await request.json());

    const result = await createOrganizationForUserUseCase.execute(
      {
        userId: actor.userId,
        name: body.name,
        slug: body.slug,
        timezone: body.timezone,
        defaultLocale: body.defaultLocale,
        defaultCurrency: body.defaultCurrency,
      },
      { actorId: actor.userId, ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const { tenant, provisioning, reusedExisting } = result.getValue();

    // Authoritative membership check before setting active tenant (same gate as PATCH /me).
    const access = await resolveTenantContextUseCase.execute({
      userId: actor.userId,
      tenantId: tenant.id,
      jwtPlatformRole: actor.platformRole,
    });
    if (access.isFailure) {
      return mapResultError(access.getError());
    }

    const active = await impersonateTenantUseCase.execute(actor.userId, tenant.id, {
      actorId: actor.userId,
      ipAddress: getClientIp(request),
    });
    if (active.isFailure) {
      return mapResultError(active.getError());
    }

    return apiSuccess(
      {
        ...serializeTenant(tenant),
        provisioning,
        reusedExisting,
        activeTenantId: tenant.id,
      },
      reusedExisting ? 200 : 201,
    );
  } catch (error) {
    return apiError(error);
  }
}
