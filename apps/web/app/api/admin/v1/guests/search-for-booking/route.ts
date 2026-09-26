import { NextRequest } from "next/server";
import {
  getGuestForBookingSelectionQuerySchema,
  searchGuestsForBookingQuerySchema,
} from "@hcp/validators";
import {
  getGuestForBookingSelectionUseCase,
  searchGuestsForBookingUseCase,
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
    const params = Object.fromEntries(request.nextUrl.searchParams);

    // Selection of a specific guest for booking prefill
    if (params.guestId) {
      const query = getGuestForBookingSelectionQuerySchema.parse(params);
      const result = await getGuestForBookingSelectionUseCase.execute(
        {
          tenantId: actor.tenantId,
          guestId: query.guestId,
          propertyId: query.propertyId,
        },
        toPermissionActor(actor),
      );
      if (result.isFailure) {
        return mapResultError(result.getError());
      }
      return apiSuccess(result.getValue());
    }

    const query = searchGuestsForBookingQuerySchema.parse(params);
    const result = await searchGuestsForBookingUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId: query.propertyId,
        search: query.search,
        limit: query.limit,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ data: result.getValue() });
  } catch (error) {
    return apiError(error);
  }
}
