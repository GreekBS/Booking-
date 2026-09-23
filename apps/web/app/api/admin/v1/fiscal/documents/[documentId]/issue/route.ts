import { NextRequest } from "next/server";
import { issueFiscalDocumentUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { z } from "zod";

const schema = z.object({
  issuanceIdempotencyKey: z.string().min(8).max(128),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const { documentId } = await context.params;
    const body = schema.parse(await request.json());
    const result = await issueFiscalDocumentUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
      {
        documentId,
        issuanceIdempotencyKey: body.issuanceIdempotencyKey,
      },
      { actorId: actor.userId, ipAddress: null },
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
