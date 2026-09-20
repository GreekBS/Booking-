import { NextRequest } from "next/server";
import { z } from "zod";
import { paginationSchema } from "@hcp/validators";
import { LEAD_SOURCES, LEAD_STATUSES } from "@hcp/domain";
import { listLeadsUseCase } from "@/lib/di/container";
import { requireSuperAdmin } from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { serializeLeadSummary } from "@/lib/marketing/serialize-lead";

const leadListQuerySchema = paginationSchema.extend({
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  demo: z.enum(["0", "1", "true", "false"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const raw = Object.fromEntries(request.nextUrl.searchParams);
    const params = leadListQuerySchema.parse(raw);

    const demoRequested =
      params.demo === "1" || params.demo === "true"
        ? true
        : params.demo === "0" || params.demo === "false"
          ? false
          : undefined;

    const result = await listLeadsUseCase.execute({
      page: params.page,
      limit: params.limit,
      status: params.status,
      source: params.source,
      demoRequested,
    });
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
