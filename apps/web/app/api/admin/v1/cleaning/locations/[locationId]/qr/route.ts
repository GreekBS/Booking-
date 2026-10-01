import { NextRequest, NextResponse } from "next/server";
import type { CleaningLocationQrView } from "@hcp/domain";
import {
  generateCleaningLocationQrUseCase,
  getCleaningLocationQrUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ locationId: string }> };

function serializeLocationQr(view: CleaningLocationQrView) {
  return {
    locationId: view.locationId,
    propertyId: view.propertyId,
    locationName: view.locationName,
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
    const { locationId } = await context.params;

    const result = await getCleaningLocationQrUseCase.execute(
      { tenantId: actor.tenantId, locationId },
      toPermissionActor(actor),
    );
    if (result.isFailure) return withNoStore(mapResultError(result.getError()));
    return withNoStore(apiSuccess({ data: serializeLocationQr(result.getValue()) }));
  } catch (error) {
    return withNoStore(
      mapResultError(error instanceof Error ? error : new Error(String(error))),
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { locationId } = await context.params;

    const result = await generateCleaningLocationQrUseCase.execute(
      { tenantId: actor.tenantId, locationId },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );
    if (result.isFailure) return withNoStore(mapResultError(result.getError()));
    return withNoStore(apiSuccess({ data: serializeLocationQr(result.getValue()) }));
  } catch (error) {
    return withNoStore(
      mapResultError(error instanceof Error ? error : new Error(String(error))),
    );
  }
}
