import { NextRequest } from "next/server";
import {
  listPaymentsUseCase,
  listFoliosForBookingUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ bookingId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { bookingId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const permissionActor = toPermissionActor(actor);
    const includeFolios =
      request.nextUrl.searchParams.get("includeFolios") !== "false";

    const paymentsResult = await listPaymentsUseCase.execute(
      actor.tenantId,
      permissionActor,
      { bookingId },
    );
    if (paymentsResult.isFailure) {
      return mapResultError(paymentsResult.getError());
    }

    let folios: unknown[] | undefined;
    if (includeFolios) {
      const foliosResult = await listFoliosForBookingUseCase.execute(
        actor.tenantId,
        bookingId,
        permissionActor,
      );
      if (foliosResult.isFailure) {
        return mapResultError(foliosResult.getError());
      }
      folios = foliosResult.getValue();
    }

    return apiSuccess({
      payments: paymentsResult.getValue(),
      ...(folios !== undefined ? { folios } : {}),
    });
  } catch (error) {
    return apiError(error);
  }
}
