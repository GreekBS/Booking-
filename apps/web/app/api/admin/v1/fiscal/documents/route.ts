import { NextRequest } from "next/server";
import {
  listFiscalDocumentsUseCase,
  createFiscalDocumentDraftUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { z } from "zod";

const draftSchema = z.object({
  folioId: z.string().uuid(),
  seriesId: z.string().uuid(),
  documentKind: z.enum([
    "SERVICE_INVOICE",
    "SERVICE_RECEIPT",
    "SERVICE_CREDIT",
    "RETAIL_CREDIT",
    "CLIMATE_RESILIENCE_FEE_RECEIPT",
  ]),
  customerBillingProfileId: z.string().uuid().nullable().optional(),
  retailCustomerName: z.string().nullable().optional(),
  paymentMethodSummary: z.string().nullable().optional(),
  lineSelections: z
    .array(
      z.object({
        folioLineId: z.string().uuid(),
        allocateAmount: z.string().regex(/^\d+(\.\d{1,4})?$/),
        description: z.string().optional(),
      }),
    )
    .min(1),
});

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const propertyId = request.nextUrl.searchParams.get("propertyId") ?? undefined;
    const result = await listFiscalDocumentsUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
      { propertyId, limit: 100 },
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess({ documents: result.getValue() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = draftSchema.parse(await request.json());
    const result = await createFiscalDocumentDraftUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
      {
        folioId: body.folioId,
        seriesId: body.seriesId,
        documentKind: body.documentKind,
        customerBillingProfileId: body.customerBillingProfileId ?? null,
        retailCustomerName: body.retailCustomerName ?? null,
        paymentMethodSummary: body.paymentMethodSummary ?? null,
        lineSelections: body.lineSelections,
      },
      { actorId: actor.userId, ipAddress: null },
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
