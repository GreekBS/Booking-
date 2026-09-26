import { NextRequest } from "next/server";
import { addGuestNoteBodySchema } from "@hcp/validators";
import {
  addGuestNoteUseCase,
  listGuestNotesUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ guestId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { guestId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await listGuestNotesUseCase.execute(
      { tenantId: actor.tenantId, guestId },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({
      data: result.getValue().map((n) => ({
        id: n.id,
        guestId: n.guestId,
        authorUserId: n.authorUserId,
        propertyId: n.propertyId,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
        isTenantWide: n.isTenantWide,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { guestId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = addGuestNoteBodySchema.parse(await request.json());

    const result = await addGuestNoteUseCase.execute(
      {
        tenantId: actor.tenantId,
        guestId,
        body: body.body,
        propertyId: body.propertyId,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const n = result.getValue();
    return apiSuccess(
      {
        id: n.id,
        guestId: n.guestId,
        authorUserId: n.authorUserId,
        propertyId: n.propertyId,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
        isTenantWide: n.isTenantWide,
      },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
