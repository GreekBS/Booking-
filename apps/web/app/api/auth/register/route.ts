import { NextRequest } from "next/server";
import { registerUserSchema } from "@hcp/validators";
import { registerUserUseCase } from "@/lib/di/container";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { validateCsrf } from "@/lib/security/csrf";
import { checkAuthRateLimit } from "@/lib/security/rate-limit";
import { createLogger } from "@/lib/logging/logger";

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const log = createLogger({ requestId, action: "auth.register" });

  try {
    validateCsrf(request);
    checkAuthRateLimit(request);

    const body = registerUserSchema.parse(await request.json());
    const result = await registerUserUseCase.execute(body);

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const { userId, verificationToken } = result.getValue();
    log.info("User registered", { userId });
    console.info(`[VERIFY EMAIL STUB] user=${userId} token=${verificationToken}`);

    return apiSuccess({ userId, message: "Registration successful" }, 201);
  } catch (error) {
    log.error("Registration failed", { error: String(error) });
    return apiError(error);
  }
}
