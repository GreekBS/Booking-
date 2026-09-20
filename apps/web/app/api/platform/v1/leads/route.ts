import { NextRequest } from "next/server";
import { paginationSchema } from "@hcp/validators";
import { listLeadsUseCase } from "@/lib/di/container";
import { requireSuperAdmin } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeLeadSummary } from "@/lib/marketing/serialize-lead";

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const params = paginationSchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    const result = await listLeadsUseCase.execute(params);
    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const page = result.getValue();
    return apiSuccess({
      data: page.data.map(serializeLeadSummary),
      meta: {
        total: page.total,
        page: page.page,
        limit: page.limit,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
