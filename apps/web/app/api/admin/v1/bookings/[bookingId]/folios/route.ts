import { NextRequest } from "next/server";
import {
  listFoliosForBookingUseCase,
  openPrimaryFolioFromBookingUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ bookingId: string }> };

/** List folios for a booking (read). */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { bookingId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await listFoliosForBookingUseCase.execute(
      actor.tenantId,
      bookingId,
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ folios: result.getValue() });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Open (or return) the primary folio projected from the booking quote snapshot.
 * Idempotent under (tenantId, bookingId, folioKey=primary).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { bookingId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await openPrimaryFolioFromBookingUseCase.execute(
      actor.tenantId,
      bookingId,
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
