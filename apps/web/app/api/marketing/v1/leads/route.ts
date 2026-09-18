import { NextRequest } from "next/server";
import { ValidationError } from "@hcp/domain";
import { createLeadSchema } from "@hcp/validators";
import { createLeadUseCase } from "@/lib/di/container";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { validateCsrf } from "@/lib/security/csrf";
import { checkLeadRateLimit } from "@/lib/marketing/lead-rate-limit";
import { createLogger } from "@/lib/logging/logger";

/**
 * Public marketing lead capture.
 * Does not create User/Tenant/Membership.
 */
export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const log = createLogger({ requestId, action: "marketing.lead.create" });

  try {
    validateCsrf(request);
    checkLeadRateLimit(request);

    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 32_768) {
      throw new ValidationError("Payload too large");
    }

    const body = createLeadSchema.parse(await request.json());
    const result = await createLeadUseCase.execute(body);

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const { id } = result.getValue();
    log.info("Lead created", { leadId: id });

    return apiSuccess({ id }, 201);
  } catch (error) {
    log.error("Lead creation failed", { error: String(error) });
    return apiError(error);
  }
}
