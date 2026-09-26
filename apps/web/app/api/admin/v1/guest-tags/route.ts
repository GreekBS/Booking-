import { NextRequest } from "next/server";
import { createGuestTagBodySchema } from "@hcp/validators";
import {
  createGuestTagUseCase,
  listGuestTagsUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await listGuestTagsUseCase.execute(
      { tenantId: actor.tenantId },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({
      data: result.getValue().map((t) => ({
        id: t.id,
        name: t.name,
        archivedAt: t.archivedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = createGuestTagBodySchema.parse(await request.json());

    const result = await createGuestTagUseCase.execute(
      { tenantId: actor.tenantId, name: body.name },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const t = result.getValue();
    return apiSuccess({ id: t.id, name: t.name, archivedAt: null }, 201);
  } catch (error) {
    return apiError(error);
  }
}
