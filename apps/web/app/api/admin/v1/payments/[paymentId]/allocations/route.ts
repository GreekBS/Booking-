import { NextRequest } from "next/server";
import { allocatePaymentUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { auditFromRequest } from "@/lib/admin/audit-from-request";
import { z } from "zod";

type RouteContext = { params: Promise<{ paymentId: string }> };

const bodySchema = z.object({
  folioId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  reason: z.string().nullable().optional(),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { paymentId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = bodySchema.parse(await request.json());

    const result = await allocatePaymentUseCase.execute({
      tenantId: actor.tenantId,
      paymentId,
      folioId: body.folioId,
      amount: body.amount,
      actor: toPermissionActor(actor),
      auditEntry: auditFromRequest(
        request,
        actor,
        "payment.allocate",
        "payment",
        paymentId,
      ),
      reason: body.reason,
    });

    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
