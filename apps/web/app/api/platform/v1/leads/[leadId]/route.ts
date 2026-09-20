import { getLeadUseCase } from "@/lib/di/container";
import { requireSuperAdmin } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeLeadDetail } from "@/lib/marketing/serialize-lead";

type RouteContext = { params: Promise<{ leadId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireSuperAdmin();
    const { leadId } = await context.params;
    const result = await getLeadUseCase.execute(leadId);
    if (result.isFailure) {
      return mapResultError(result.getError());
    }
    return apiSuccess(serializeLeadDetail(result.getValue()));
  } catch (error) {
    return apiError(error);
  }
}
