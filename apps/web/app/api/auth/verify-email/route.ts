import { NextRequest } from "next/server";
import { verifyEmailSchema } from "@hcp/validators";
import { verifyEmailUseCase } from "@/lib/di/container";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { checkAuthRateLimit } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  try {
    checkAuthRateLimit(request);
    const body = verifyEmailSchema.parse(await request.json());
    const result = await verifyEmailUseCase.execute(body);

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ message: "Email verified" });
  } catch (error) {
    return apiError(error);
  }
}
