import { NextRequest, NextResponse } from "next/server";
import { generateUnitQrUseCase, getUnitQrUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";
import type { UnitQrView } from "@hcp/domain";

type RouteContext = { params: Promise<{ unitId: string }> };

function serializeUnitQr(view: UnitQrView) {
  return {
    unitId: view.unitId,
    propertyId: view.propertyId,
    unitName: view.unitName,
    propertyName: view.propertyName,
    status: view.status,
    createdAt: view.createdAt?.toISOString() ?? null,
    rotatedAt: view.rotatedAt?.toISOString() ?? null,
    recoverable: view.recoverable,
    token: view.token,
  };
}

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { unitId } = await context.params;

    const result = await getUnitQrUseCase.execute(
      { tenantId: actor.tenantId, unitId },
      toPermissionActor(actor),
    );
    if (result.isFailure) return withNoStore(mapResultError(result.getError()));
    return withNoStore(apiSuccess({ data: serializeUnitQr(result.getValue()) }));
  } catch (error) {
    return withNoStore(
      mapResultError(error instanceof Error ? error : new Error(String(error))),
    );
  }
}

/** Mints a code when the unit has none; existing ACTIVE codes are recovered when sealed. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { unitId } = await context.params;

    const result = await generateUnitQrUseCase.execute(
      { tenantId: actor.tenantId, unitId },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );
    if (result.isFailure) return withNoStore(mapResultError(result.getError()));
    return withNoStore(apiSuccess({ data: serializeUnitQr(result.getValue()) }));
  } catch (error) {
    return withNoStore(
      mapResultError(error instanceof Error ? error : new Error(String(error))),
    );
  }
}
