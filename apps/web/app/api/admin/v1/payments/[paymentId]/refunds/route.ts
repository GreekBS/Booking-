import { NextRequest } from "next/server";
import { createRefundUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { auditFromRequest } from "@/lib/admin/audit-from-request";
import { z } from "zod";

type RouteContext = { params: Promise<{ paymentId: string }> };

const bodySchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  reason: z.string().nullable().optional(),
  idempotencyKey: z.string().min(1),
  externalReference: z.string().nullable().optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { paymentId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = bodySchema.parse(await request.json());

    const result = await createRefundUseCase.execute({
      tenantId: actor.tenantId,
      paymentId,
      amount: body.amount,
      idempotencyKey: body.idempotencyKey,
      actor: toPermissionActor(actor),
      auditEntry: auditFromRequest(
        request,
        actor,
        "payment.refund",
        "payment",
        paymentId,
      ),
      reason: body.reason,
      externalReference: body.externalReference,
    });

    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
