import { NextRequest } from "next/server";
import {
  addCleaningLocationBodySchema,
  cleaningLocationsBoardQuerySchema,
} from "@hcp/validators";
import {
  addCleaningLocationUseCase,
  listCleaningLocationsBoardUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const query = cleaningLocationsBoardQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await listCleaningLocationsBoardUseCase.execute(
      { tenantId: actor.tenantId, propertyId: query.propertyId },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );
    if (result.isFailure) return mapResultError(result.getError());

    const board = result.getValue();
    return apiSuccess({
      propertyType: board.propertyType,
      mode: board.mode,
      requiresManualResolution: board.requiresManualResolution,
      data: board.rows.map((row) => ({
        locationId: row.locationId,
        propertyId: row.propertyId,
        name: row.name,
        sortOrder: row.sortOrder,
        commercialUnitId: row.commercialUnitId,
        readinessStatus: row.readinessStatus,
        readinessVersion: row.readinessVersion,
        readinessSource: row.readinessSource,
        lastCompletedAt: row.lastCompletedAt?.toISOString() ?? null,
        openTask: row.openTask,
        hasActiveQr: row.hasActiveQr,
      })),
    });
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = addCleaningLocationBodySchema.parse(await request.json());

    const result = await addCleaningLocationUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId: body.propertyId,
        name: body.name,
      },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );
    if (result.isFailure) return mapResultError(result.getError());

    const created = result.getValue();
    return apiSuccess(
      {
        data: {
          id: created.id,
          propertyId: created.propertyId,
          name: created.name,
          status: created.status,
          sortOrder: created.sortOrder,
          commercialUnitId: created.commercialUnitId,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
          archivedAt: created.archivedAt?.toISOString() ?? null,
        },
      },
      201,
    );
  } catch (error) {
    return mapResultError(error instanceof Error ? error : new Error(String(error)));
  }
}
