import { NextRequest } from "next/server";
import { enqueueJobSchema } from "@hcp/validators";
import { UnauthorizedError } from "@hcp/domain";
import { enqueueJobUseCase } from "@/lib/di/container";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

export async function POST(request: NextRequest) {
  try {
    const jobsSecret = process.env.BACKGROUND_JOBS_SECRET;
    const authHeader = request.headers.get("authorization");

    if (!jobsSecret || authHeader !== `Bearer ${jobsSecret}`) {
      throw new UnauthorizedError();
    }

    const body = await request.json().catch(() => ({}));
    const parsed = enqueueJobSchema.parse(body);

    const result = await enqueueJobUseCase.execute({
      jobType: parsed.jobType,
      payload: parsed.payload,
      idempotencyKey: parsed.idempotencyKey,
      runAt: parsed.runAt ? new Date(parsed.runAt) : undefined,
      priority: parsed.priority,
      maxAttempts: parsed.maxAttempts,
      tenantId: parsed.tenantId,
    });

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
