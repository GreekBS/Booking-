import { NextRequest } from "next/server";
import {
  requestPasswordResetSchema,
  resetPasswordSchema,
} from "@hcp/validators";
import {
  requestPasswordResetUseCase,
  resetPasswordUseCase,
} from "@/lib/di/container";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { validateCsrf } from "@/lib/security/csrf";
import { checkAuthRateLimit } from "@/lib/security/rate-limit";
import { createLogger } from "@/lib/logging/logger";

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const log = createLogger({ requestId, action: "auth.password_reset.request" });

  try {
    validateCsrf(request);
    checkAuthRateLimit(request);

    const body = requestPasswordResetSchema.parse(await request.json());
    const result = await requestPasswordResetUseCase.execute(body);

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const { resetToken } = result.getValue();
    if (resetToken) {
      console.info(`[PASSWORD RESET STUB] email=${body.email} token=${resetToken}`);
    }

    log.info("Password reset requested", { email: body.email });
    return apiSuccess({ message: "If the account exists, a reset link was sent" });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    validateCsrf(request);
    checkAuthRateLimit(request);

    const body = resetPasswordSchema.parse(await request.json());
    const result = await resetPasswordUseCase.execute(body);

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess({ message: "Password updated" });
  } catch (error) {
    return apiError(error);
  }
}
