import { NextRequest } from "next/server";
import { resolveQrBodySchema } from "@hcp/validators";
import { resolveUnitQrUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";

/**
 * Exchanges a scanned QR token for unit identity.
 * Authentication is mandatory — the token alone grants nothing.
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = resolveQrBodySchema.parse(await request.json());

    const result = await resolveUnitQrUseCase.execute(
      { tenantId: actor.tenantId, token: body.token },
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess({ data: result.getValue() });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
