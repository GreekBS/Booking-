import { NextRequest } from "next/server";
import { updateGuestBodySchema } from "@hcp/validators";
import {
  getGuestProfileUseCase,
  updateGuestUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ guestId: string }> };

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

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { guestId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await getGuestProfileUseCase.execute(
      { tenantId: actor.tenantId, guestId },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const profile = result.getValue();
    return apiSuccess({
      guest: serializeGuest(profile.guest),
      metrics: profile.metrics,
      tags: profile.tags,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { guestId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = updateGuestBodySchema.parse(await request.json());

    const result = await updateGuestUseCase.execute(
      {
        tenantId: actor.tenantId,
        guestId,
        ...body,
      },
      toPermissionActor(actor),
      { ipAddress: getClientIp(request) },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeGuest(result.getValue()));
  } catch (error) {
    return apiError(error);
  }
}
