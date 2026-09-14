import { NextRequest } from "next/server";
import { changeBookingStaySchema } from "@hcp/validators";
import { changeBookingStayUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  serializeBooking,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ bookingId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { bookingId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = changeBookingStaySchema.parse(await request.json());

    const result = await changeBookingStayUseCase.execute(
      {
        tenantId: actor.tenantId,
        bookingId,
        ...body,
      },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeBooking(result.getValue()));
  } catch (error) {
    return apiError(error);
  }
}
