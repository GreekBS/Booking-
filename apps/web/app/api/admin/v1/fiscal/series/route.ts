import { NextRequest } from "next/server";
import {
  listFiscalSeriesUseCase,
  createFiscalSeriesUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { z } from "zod";

const createSchema = z.object({
  propertyId: z.string().uuid(),
  documentKind: z.enum([
    "SERVICE_INVOICE",
    "SERVICE_RECEIPT",
    "SERVICE_CREDIT",
    "RETAIL_CREDIT",
    "CLIMATE_RESILIENCE_FEE_RECEIPT",
  ]),
  seriesCode: z.string().min(1).max(32),
  label: z.string().nullable().optional(),
  nextSequence: z.number().int().positive().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const result = await listFiscalSeriesUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess({ series: result.getValue() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = createSchema.parse(await request.json());
    const result = await createFiscalSeriesUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
      {
        propertyId: body.propertyId,
        documentKind: body.documentKind,
        seriesCode: body.seriesCode,
        label: body.label ?? null,
        nextSequence: body.nextSequence,
      },
      { actorId: actor.userId, ipAddress: null },
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
