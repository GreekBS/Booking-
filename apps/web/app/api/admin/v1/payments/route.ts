import { NextRequest } from "next/server";
import {
  listPaymentsUseCase,
  recordManualPaymentUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { auditFromRequest } from "@/lib/admin/audit-from-request";
import { z } from "zod";

const moneySchema = z.string().regex(/^\d+(\.\d{1,4})?$/);

const recordManualSchema = z.object({
  amount: moneySchema,
  currency: z.string().length(3),
  method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "OTA", "OTHER"]),
  collectionSource: z.enum([
    "DIRECT",
    "PROPERTY",
    "OTA",
    "PAYMENT_GATEWAY",
    "OTHER",
  ]),
  propertyId: z.string().uuid(),
  bookingId: z.string().uuid().optional(),
  payerName: z.string().nullable().optional(),
  externalReference: z.string().nullable().optional(),
  idempotencyKey: z.string().min(1),
  receivedAt: z.string().datetime().optional(),
  initialAllocations: z
    .array(
      z.object({
        folioId: z.string().uuid(),
        amount: moneySchema,
        reason: z.string().nullable().optional(),
      }),
    )
    .optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const bookingId = request.nextUrl.searchParams.get("bookingId") ?? undefined;
    const propertyId =
      request.nextUrl.searchParams.get("propertyId") ?? undefined;
    const limitRaw = request.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;

    const result = await listPaymentsUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
      {
        bookingId,
        propertyId,
        limit: Number.isFinite(limit) ? limit : undefined,
      },
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess({ payments: result.getValue() });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = recordManualSchema.parse(await request.json());

    const result = await recordManualPaymentUseCase.execute({
      tenantId: actor.tenantId,
      actor: toPermissionActor(actor),
      auditEntry: auditFromRequest(
        request,
        actor,
        "payment.record_manual",
        "payment",
      ),
      currency: body.currency,
      amount: body.amount,
      method: body.method,
      collectionSource: body.collectionSource,
      propertyId: body.propertyId,
      bookingId: body.bookingId ?? null,
      payerName: body.payerName,
      externalReference: body.externalReference,
      idempotencyKey: body.idempotencyKey,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : undefined,
      metadata: body.metadata,
      initialFolioAllocations: body.initialAllocations?.map((a) => ({
        folioId: a.folioId,
        amount: a.amount,
        reason: a.reason,
      })),
    });

    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
