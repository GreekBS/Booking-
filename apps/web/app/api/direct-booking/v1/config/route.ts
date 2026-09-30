import { NextRequest } from "next/server";
import { getDirectBookingPublicConfigUseCase } from "@/lib/di/container";
import { requireDirectBookingContext } from "@/lib/direct-booking/direct-booking-context";
import { checkDirectBookingRateLimit } from "@/lib/direct-booking/direct-booking-rate-limit";
import {
  directBookingError,
  directBookingSuccess,
  mapDirectBookingResultError,
} from "@/lib/direct-booking/direct-booking-response";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireDirectBookingContext(request);
    checkDirectBookingRateLimit(request, ctx.integration.id);

    const result = await getDirectBookingPublicConfigUseCase.execute(ctx.integration);
    if (result.isFailure) {
      return mapDirectBookingResultError(result.getError());
    }

    return directBookingSuccess(ctx, result.getValue());
  } catch (error) {
    return directBookingError(error);
  }
}
