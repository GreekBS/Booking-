import { NextRequest } from "next/server";
import { dispatchOutboxSchema } from "@hcp/validators";
import { UnauthorizedError } from "@hcp/domain";
import { processOutboxBatchUseCase } from "@/lib/di/container";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

export async function POST(request: NextRequest) {
  try {
    const dispatchSecret = process.env.OUTBOX_DISPATCH_SECRET;
    const authHeader = request.headers.get("authorization");

    if (!dispatchSecret || authHeader !== `Bearer ${dispatchSecret}`) {
      throw new UnauthorizedError();
    }

    const limitParam = request.nextUrl.searchParams.get("limit");
    const body = await request.json().catch(() => ({}));
    const parsed = dispatchOutboxSchema.parse({
      limit: limitParam ?? body.limit,
    });

    const result = await processOutboxBatchUseCase.execute(parsed.limit ?? 100);

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
