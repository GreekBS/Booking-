import { NextRequest } from "next/server";
import { bookingStatusCountsQuerySchema } from "@hcp/validators";
import { countBookingsByStatusUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

/**
 * Authoritative status-tab counts for the Bookings list.
 * Same tenant/ACL/property/advanced-filter scope as GET /bookings,
 * without applying a status tab filter.
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const query = bookingStatusCountsQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await countBookingsByStatusUseCase.execute(
      {
        tenantId: actor.tenantId,
        unitId: query.unitId,
        propertyId: query.propertyId,
        checkInFrom: query.checkInFrom,
        checkInTo: query.checkInTo,
        checkOutFrom: query.checkOutFrom,
        checkOutTo: query.checkOutTo,
        createdAtFrom: query.createdAtFrom,
        createdAtTo: query.createdAtTo,
        guestSearch: query.guestSearch,
        excludeSuperseded: query.excludeSuperseded ?? true,
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
