import { NextRequest } from "next/server";
import { previewBookingFinancialRepriceSchema } from "@hcp/validators";
import { previewBookingFinancialRepriceUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ bookingId: string }> };

/**
 * POST /api/admin/v1/bookings/:bookingId/financial-reprice/preview
 * BFS-2 read-only RatePlan reprice preview + HMAC confirmation token.
 * Never mutates booking, quote, folio, or payment rows.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { bookingId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = previewBookingFinancialRepriceSchema.parse(await request.json());

    const result = await previewBookingFinancialRepriceUseCase.execute(
      {
        tenantId: actor.tenantId,
        bookingId,
        unitId: body.unitId,
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        guestCount: body.guestCount,
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
