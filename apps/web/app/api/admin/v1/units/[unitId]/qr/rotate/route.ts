import { NextRequest, NextResponse } from "next/server";
import { rotateUnitQrUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ unitId: string }> };

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** Revokes the current code and mints a replacement. Old printouts stop working. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { unitId } = await context.params;

    const result = await rotateUnitQrUseCase.execute(
      { tenantId: actor.tenantId, unitId },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );
    if (result.isFailure) return withNoStore(mapResultError(result.getError()));

    const view = result.getValue();
    return withNoStore(
      apiSuccess({
        data: {
          unitId: view.unitId,
          propertyId: view.propertyId,
          unitName: view.unitName,
          propertyName: view.propertyName,
          status: view.status,
          createdAt: view.createdAt?.toISOString() ?? null,
          rotatedAt: view.rotatedAt?.toISOString() ?? null,
          recoverable: view.recoverable,
          token: view.token,
        },
      }),
    );
  } catch (error) {
    return withNoStore(
      mapResultError(error instanceof Error ? error : new Error(String(error))),
    );
  }
}
