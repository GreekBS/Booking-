import { NextRequest } from "next/server";
import { reversePaymentAllocationUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { auditFromRequest } from "@/lib/admin/audit-from-request";
import { z } from "zod";

type RouteContext = {
  params: Promise<{ paymentId: string; allocationId: string }>;
};

const bodySchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/),
  reason: z.string().min(1),
});

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { paymentId, allocationId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = bodySchema.parse(await request.json());

    const result = await reversePaymentAllocationUseCase.execute({
      tenantId: actor.tenantId,
      paymentId,
      allocationId,
      amount: body.amount,
      reason: body.reason,
      actor: toPermissionActor(actor),
      auditEntry: auditFromRequest(
        request,
        actor,
        "payment.allocation_reverse",
        "payment_allocation",
        allocationId,
      ),
    });

    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
