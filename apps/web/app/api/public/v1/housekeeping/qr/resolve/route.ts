import { NextRequest, NextResponse } from "next/server";
import { resolveQrBodySchema } from "@hcp/validators";
import { resolvePublicQrRouteUseCase } from "@/lib/di/container";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { checkPublicQrResolveRateLimit } from "@/lib/security/housekeeping-staff-rate-limit";

/**
 * Public QR routing decision (website redirect vs staff PIN).
 * Does not mutate housekeeping status and does not issue capability.
 */
export async function POST(request: NextRequest) {
  try {
    checkPublicQrResolveRateLimit(request);
    const body = resolveQrBodySchema.parse(await request.json());
    const result = await resolvePublicQrRouteUseCase.execute({
      token: body.token,
    });
    if (result.isFailure) {
      return mapResultError(result.getError());
    }
    const { route, identity } = result.getValue();
    return apiSuccess({
      route,
      // Public identity for staff UI bootstrap — no secrets.
      context: {
        propertyId: identity.propertyId,
        propertyName: identity.propertyName,
        locationId: identity.locationId,
        locationName: identity.locationName,
        unitId: identity.unitId,
        pinConfigured: identity.pinConfigured,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Too many requests") {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many requests" } },
        { status: 429 },
      );
    }
    return apiError(error);
  }
}
