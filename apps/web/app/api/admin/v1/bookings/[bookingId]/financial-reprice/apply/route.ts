import { NextRequest } from "next/server";
import { applyBookingFinancialRepriceSchema } from "@hcp/validators";
import { applyBookingFinancialRepriceUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ bookingId: string }> };

/**
 * POST /api/admin/v1/bookings/:bookingId/financial-reprice/apply
 * BFS-3b-2: atomic confirmed financial reprice (quote/booking/amendment/folio/audit).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { bookingId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = applyBookingFinancialRepriceSchema.parse(await request.json());

    const result = await applyBookingFinancialRepriceUseCase.execute(
      {
        tenantId: actor.tenantId,
        bookingId,
        confirmationToken: body.confirmationToken,
        reason: body.reason,
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
