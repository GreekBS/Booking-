import { NextRequest } from "next/server";
import { requestLeadDemoUseCase } from "@/lib/di/container";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { validateCsrf } from "@/lib/security/csrf";
import { checkLeadRateLimit } from "@/lib/marketing/lead-rate-limit";
import { createLogger } from "@/lib/logging/logger";

type RouteContext = { params: Promise<{ leadId: string }> };

/**
 * Public marketing action: record that this Lead requested a demo.
 * Does not expose status mutation or other Lead fields.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const log = createLogger({ requestId, action: "marketing.lead.requestDemo" });

  try {
    validateCsrf(request);
    checkLeadRateLimit(request);

    const { leadId } = await context.params;
    const result = await requestLeadDemoUseCase.execute({ leadId });

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const value = result.getValue();
    log.info("Lead demo requested", { leadId: value.id });

    return apiSuccess({
      id: value.id,
      demoRequestedAt: value.demoRequestedAt.toISOString(),
    });
  } catch (error) {
    log.error("Lead demo request failed", { error: String(error) });
    return apiError(error);
  }
}
