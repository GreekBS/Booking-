import { NextRequest } from "next/server";
import { setStaffPinBodySchema } from "@hcp/validators";
import { setPropertyStaffPinUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ propertyId: string }> };

/** Operator-only: set/rotate property staff PIN (bcrypt). Never returns hash. */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { propertyId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = setStaffPinBodySchema.parse(await request.json());

    const result = await setPropertyStaffPinUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId,
        pin: body.pin,
      },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ pinConfigured: true });
  } catch (error) {
    return apiError(error);
  }
}
