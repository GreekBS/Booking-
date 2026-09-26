import { NextRequest } from "next/server";
import {
  createGuestBodySchema,
  listGuestsQuerySchema,
} from "@hcp/validators";
import {
  createGuestUseCase,
  listGuestsUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

function serializeGuest(guest: {
  id: string;
  tenantId: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  preferredLanguage: string | null;
  archivedAt: Date | null;
  mergedIntoGuestId: string | null;
  anonymizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: guest.id,
    tenantId: guest.tenantId,
    displayName: guest.displayName,
    firstName: guest.firstName,
    lastName: guest.lastName,
    email: guest.email,
    phone: guest.phone,
    country: guest.country,
    preferredLanguage: guest.preferredLanguage,
    archivedAt: guest.archivedAt?.toISOString() ?? null,
    mergedIntoGuestId: guest.mergedIntoGuestId,
    anonymizedAt: guest.anonymizedAt?.toISOString() ?? null,
    createdAt: guest.createdAt.toISOString(),
    updatedAt: guest.updatedAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const query = listGuestsQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await listGuestsUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId: query.propertyId,
        entireTenant: query.entireTenant,
        search: query.search,
        includeArchived: query.includeArchived,
        page: query.page,
        limit: query.limit,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const page = result.getValue();
    return apiSuccess({
      data: page.data.map((row) => ({
        guest: serializeGuest(row.guest),
        metrics: {
          stayCount: row.metrics.stayCount,
          lastStayCheckOut: row.metrics.lastStayCheckOut,
          nextStayCheckIn: row.metrics.nextStayCheckIn,
        },
        tags: row.tags,
      })),
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
    const body = createGuestBodySchema.parse(await request.json());

    const result = await createGuestUseCase.execute(
      {
        tenantId: actor.tenantId,
        contact: {
          displayName: body.displayName,
          firstName: body.firstName,
          lastName: body.lastName,
          email: body.email,
          phone: body.phone,
          country: body.country,
          preferredLanguage: body.preferredLanguage,
        },
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    void getClientIp(request);
    return apiSuccess(serializeGuest(result.getValue()), 201);
  } catch (error) {
    return apiError(error);
  }
}
