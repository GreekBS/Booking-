import { NextRequest } from "next/server";
import { runJobsSchema } from "@hcp/validators";
import { UnauthorizedError } from "@hcp/domain";
import { processJobBatchUseCase } from "@/lib/di/container";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

export async function POST(request: NextRequest) {
  try {
    const jobsSecret = process.env.BACKGROUND_JOBS_SECRET;
    const authHeader = request.headers.get("authorization");

    if (!jobsSecret || authHeader !== `Bearer ${jobsSecret}`) {
      throw new UnauthorizedError();
    }

    const limitParam = request.nextUrl.searchParams.get("limit");
    const jobTypesParam = request.nextUrl.searchParams.getAll("jobTypes");
    const body = await request.json().catch(() => ({}));
    const parsed = runJobsSchema.parse({
      limit: limitParam ?? body.limit,
      jobTypes: jobTypesParam.length > 0 ? jobTypesParam : body.jobTypes,
    });

    const result = await processJobBatchUseCase.execute(parsed.limit ?? 50, {
      jobTypes: parsed.jobTypes,
    });

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
