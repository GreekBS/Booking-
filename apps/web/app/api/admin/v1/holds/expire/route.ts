import { NextRequest } from "next/server";
import { expireHoldsSchema } from "@hcp/validators";
import { expireHoldsUseCase } from "@/lib/di/container";
import { requireSuperAdmin } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

// Deprecated: prefer background job flow — enqueue expire_holds, then POST /api/internal/v1/jobs/run
export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.HOLD_EXPIRY_CRON_SECRET;
    const authHeader = request.headers.get("authorization");

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      await requireSuperAdmin();
    }

    const limitParam = request.nextUrl.searchParams.get("limit");
    const body = await request.json().catch(() => ({}));
    const parsed = expireHoldsSchema.parse({
      limit: limitParam ?? body.limit,
    });

    const result = await expireHoldsUseCase.execute(new Date(), parsed.limit ?? 100);

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
