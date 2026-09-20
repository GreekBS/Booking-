import { NextRequest } from "next/server";
import { updateLeadStatusSchema } from "@hcp/validators";
import { updateLeadStatusUseCase } from "@/lib/di/container";
import { requireSuperAdmin } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeLeadDetail } from "@/lib/marketing/serialize-lead";

type RouteContext = { params: Promise<{ leadId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    await requireSuperAdmin();
    const { leadId } = await context.params;
    const body = updateLeadStatusSchema.parse(await request.json());
    const result = await updateLeadStatusUseCase.execute({
      leadId,
      status: body.status,
    });
    if (result.isFailure) {
      return mapResultError(result.getError());
    }
    return apiSuccess(serializeLeadDetail(result.getValue()));
  } catch (error) {
    return apiError(error);
  }
}
