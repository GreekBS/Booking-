import { NextRequest, NextResponse } from "next/server";
import {
  getStaffHousekeepingStatusUseCase,
  hkStaffCapabilitySigner,
} from "@/lib/di/container";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { readHkStaffClaims } from "@/lib/housekeeping/hk-staff-cookie";
import { checkStaffMutationRateLimit } from "@/lib/security/housekeeping-staff-rate-limit";
import { ForbiddenError } from "@hcp/domain";

export async function GET(request: NextRequest) {
  try {
    checkStaffMutationRateLimit(request);
    const claims = await readHkStaffClaims(hkStaffCapabilitySigner);
    if (!claims) {
      return mapResultError(new ForbiddenError("Housekeeping session required"));
    }
    const result = await getStaffHousekeepingStatusUseCase.execute({ claims });
    if (result.isFailure) {
      return mapResultError(result.getError());
    }
    const view = result.getValue();
    return apiSuccess({
      propertyId: view.propertyId,
      propertyName: view.propertyName,
      locationId: view.locationId,
      locationName: view.locationName,
      unitId: view.unitId,
      unitName: view.unitName,
      status: view.status,
      version: view.version,
      updatedAt: view.updatedAt.toISOString(),
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
