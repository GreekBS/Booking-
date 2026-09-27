import { NextRequest } from "next/server";
import { resolveQrBodySchema } from "@hcp/validators";
import { resolveCleaningQrUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";

/**
 * Exchanges a scanned QR token for cleaning-location identity.
 * Tries location QR first, then legacy unit QR → linked location.
 * Authentication is mandatory — the token alone grants nothing.
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = resolveQrBodySchema.parse(await request.json());

    const result = await resolveCleaningQrUseCase.execute(
      { tenantId: actor.tenantId, token: body.token },
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());

    const value = result.getValue();
    return apiSuccess({
      data: {
        locationId: value.locationId,
        locationName: value.locationName,
        propertyId: value.propertyId,
        propertyName: value.propertyName,
        unitId: value.unitId,
        // Compat aliases for older CleaningForm / QrLanding clients.
        unitName: value.locationName,
      },
    });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
