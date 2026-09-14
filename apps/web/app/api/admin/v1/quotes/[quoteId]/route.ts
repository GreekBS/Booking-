import { NextRequest } from "next/server";
import { getQuoteUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  serializeQuote,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

type RouteContext = { params: Promise<{ quoteId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { quoteId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);

    const result = await getQuoteUseCase.execute(
      actor.tenantId,
      quoteId,
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeQuote(result.getValue()));
  } catch (error) {
    return apiError(error);
  }
}
