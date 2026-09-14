import { NextRequest } from "next/server";
import { createQuoteSchema } from "@hcp/validators";
import { createQuoteUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  serializeQuote,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = createQuoteSchema.parse(await request.json());

    const result = await createQuoteUseCase.execute(
      {
        tenantId: actor.tenantId,
        holdId: body.holdId,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    return apiSuccess(serializeQuote(result.getValue()), 201);
  } catch (error) {
    return apiError(error);
  }
}
