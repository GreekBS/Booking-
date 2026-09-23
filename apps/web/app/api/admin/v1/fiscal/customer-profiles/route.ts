import { NextRequest } from "next/server";
import {
  listCustomerBillingProfilesUseCase,
  upsertCustomerBillingProfileUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { z } from "zod";

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(["INDIVIDUAL", "BUSINESS"]),
  legalName: z.string().min(1),
  vatNumber: z.string().nullable().optional(),
  country: z.string().length(2),
  address: z.object({
    line1: z.string().min(1),
    line2: z.string().nullable().optional(),
    city: z.string().min(1),
    region: z.string().nullable().optional(),
    postalCode: z.string().min(1),
    country: z.string().length(2),
  }),
  email: z.string().email().nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const result = await listCustomerBillingProfilesUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess({ profiles: result.getValue() });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = upsertSchema.parse(await request.json());
    const result = await upsertCustomerBillingProfileUseCase.execute(
      actor.tenantId,
      toPermissionActor(actor),
      {
        id: body.id,
        type: body.type,
        legalName: body.legalName,
        vatNumber: body.vatNumber ?? null,
        country: body.country,
        email: body.email ?? null,
        address: {
          line1: body.address.line1,
          line2: body.address.line2 ?? null,
          city: body.address.city,
          region: body.address.region ?? null,
          postalCode: body.address.postalCode,
          country: body.address.country,
        },
      },
    );
    if (result.isFailure) return mapResultError(result.getError());
    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
