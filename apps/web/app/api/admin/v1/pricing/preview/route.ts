import { NextRequest } from "next/server";
import { previewStayPricingSchema } from "@hcp/validators";
import { previewStayPricingUseCase } from "@/lib/di/container";
import { requireTenantContext, toPermissionActor } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

/**
 * Read-only stay pricing preview.
 * Does not create Hold, Quote, Booking, or calendar inventory.
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = previewStayPricingSchema.parse(await request.json());

    const result = await previewStayPricingUseCase.execute(
      {
        tenantId: actor.tenantId,
        unitId: body.unitId,
        checkIn: body.checkIn,
        checkOut: body.checkOut,
        guestCount: body.guestCount,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const pricing = result.getValue();
    return apiSuccess({
      currency: pricing.currency,
      subtotalAmount: pricing.subtotal.amount,
      losDiscountAmount: pricing.losDiscountAmount.amount,
      totalAmount: pricing.total.amount,
      quotedAt: pricing.quotedAt.toISOString(),
      lineItems: pricing.lineItems,
      inventoryMutating: false as const,
    });
  } catch (error) {
    return apiError(error);
  }
}
