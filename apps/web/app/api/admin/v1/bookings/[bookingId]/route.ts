import { NextRequest } from "next/server";
import { getBookingUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  serializeBooking,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ bookingId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { bookingId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await getBookingUseCase.execute(
      actor.tenantId,
      bookingId,
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeBooking(result.getValue()));
  } catch (error) {
    return apiError(error);
  }
}
