import { NextRequest } from "next/server";
import { directBookingCreateHoldSchema } from "@hcp/validators";
import { createDirectBookingHoldUseCase } from "@/lib/di/container";
import { requireDirectBookingContext } from "@/lib/direct-booking/direct-booking-context";
import { checkDirectBookingMutationRateLimit } from "@/lib/direct-booking/direct-booking-rate-limit";
import {
  directBookingError,
  directBookingSuccess,
  mapDirectBookingResultError,
} from "@/lib/direct-booking/direct-booking-response";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireDirectBookingContext(request);
    checkDirectBookingMutationRateLimit(request, ctx.integration.id);

    const body = directBookingCreateHoldSchema.parse(await request.json());
    const result = await createDirectBookingHoldUseCase.execute(ctx.integration, body);

    if (result.isFailure) {
      return mapDirectBookingResultError(result.getError());
    }

    return directBookingSuccess(ctx, result.getValue(), 201);
  } catch (error) {
    return directBookingError(error);
  }
}
