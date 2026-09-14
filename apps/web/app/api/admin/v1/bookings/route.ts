import { NextRequest } from "next/server";
import { createBookingSchema, listBookingsQuerySchema } from "@hcp/validators";
import { createBookingUseCase, searchBookingsUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  serializeBooking,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const query = listBookingsQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await searchBookingsUseCase.execute(
      {
        tenantId: actor.tenantId,
        unitId: query.unitId,
        propertyId: query.propertyId,
        status: query.status,
        checkInFrom: query.checkInFrom,
        checkInTo: query.checkInTo,
        checkOutFrom: query.checkOutFrom,
        checkOutTo: query.checkOutTo,
        guestSearch: query.guestSearch,
        page: query.page,
        limit: query.limit,
        sortBy: query.sortBy,
        sortDir: query.sortDir,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const page = result.getValue();
    return apiSuccess({
      data: page.data.map(serializeBooking),
      total: page.total,
      page: page.page,
      limit: page.limit,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = createBookingSchema.parse(await request.json());

    const result = await createBookingUseCase.execute(
      {
        tenantId: actor.tenantId,
        quoteId: body.quoteId,
        guest: {
          name: body.guest.name,
          email: body.guest.email,
          phone: body.guest.phone ?? null,
        },
        confirmationMode: body.confirmationMode,
      },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeBooking(result.getValue()), 201);
  } catch (error) {
    return apiError(error);
  }
}
