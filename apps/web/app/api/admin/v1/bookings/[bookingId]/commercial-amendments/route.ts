import { NextRequest } from "next/server";
import { listBookingCommercialAmendmentsUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ bookingId: string }> };

/**
 * GET /api/admin/v1/bookings/:bookingId/commercial-amendments
 * BFS-4 Phase 0 — read-only commercial amendment history (newest first).
 * Never exposes confirmation digests, idempotency keys, or tokens.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { bookingId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await listBookingCommercialAmendmentsUseCase.execute(
      actor.tenantId,
      bookingId,
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ amendments: result.getValue() });
  } catch (error) {
    return apiError(error);
  }
}
