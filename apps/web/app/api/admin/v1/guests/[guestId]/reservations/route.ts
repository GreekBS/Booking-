import { NextRequest } from "next/server";
import { paginationSchema } from "@hcp/validators";
import { listGuestReservationsUseCase } from "@/lib/di/container";
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
    const query = paginationSchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await listGuestReservationsUseCase.execute(
      {
        tenantId: actor.tenantId,
        guestId,
        page: query.page,
        limit: query.limit,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
