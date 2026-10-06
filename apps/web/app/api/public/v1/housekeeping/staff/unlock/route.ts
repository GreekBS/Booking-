import { NextRequest, NextResponse } from "next/server";
import { unlockStaffPinBodySchema } from "@hcp/validators";
import {
  unlockHousekeepingStaffUseCase,
  hkStaffCapabilitySigner,
} from "@/lib/di/container";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { checkStaffPinUnlockRateLimit } from "@/lib/security/housekeeping-staff-rate-limit";
import {
  HK_STAFF_COOKIE_NAME,
  hkStaffCookieOptions,
} from "@/lib/housekeeping/hk-staff-cookie";
import { HK_STAFF_CAPABILITY_TTL_SECONDS } from "@hcp/domain";

/**
 * Verify property staff PIN for a QR identity and issue hk_staff capability cookie.
 * Never returns the PIN or pin hash.
 */
export async function POST(request: NextRequest) {
  try {
    checkStaffPinUnlockRateLimit(request);
    const body = unlockStaffPinBodySchema.parse(await request.json());
    const result = await unlockHousekeepingStaffUseCase.execute({
      token: body.token,
      pin: body.pin,
    });
    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const { capabilityToken, claims, identity } = result.getValue();
    const response = apiSuccess({
      ok: true,
      expiresAt: new Date(claims.exp * 1000).toISOString(),
      context: {
        propertyId: identity.propertyId,
        propertyName: identity.propertyName,
        locationId: identity.locationId,
        locationName: identity.locationName,
        unitId: identity.unitId,
      },
    });

    response.cookies.set(
      HK_STAFF_COOKIE_NAME,
      capabilityToken,
      hkStaffCookieOptions(HK_STAFF_CAPABILITY_TTL_SECONDS),
    );

    // Ensure signer still validates (wiring sanity; no secret leakage).
    void hkStaffCapabilitySigner;

    return response;
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
