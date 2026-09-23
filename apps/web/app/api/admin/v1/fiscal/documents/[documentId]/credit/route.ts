import { NextRequest } from "next/server";
import { createCreditFiscalDocumentDraftUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { z } from "zod";

const schema = z.object({
  seriesId: z.string().uuid(),
  reason: z.string().min(1).max(512),
  creditGrossAmount: z.string().regex(/^\d+(\.\d{1,4})?$/).nullable().optional(),
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
    const result = await createCreditFiscalDocumentDraftUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
      {
        originalDocumentId: documentId,
        seriesId: body.seriesId,
        reason: body.reason,
        creditGrossAmount: body.creditGrossAmount ?? null,
      },
      { actorId: actor.userId, ipAddress: null },
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
