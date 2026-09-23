import { NextRequest } from "next/server";
import { evaluateAndPostFolioTaxesUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { z } from "zod";

type RouteContext = { params: Promise<{ folioId: string }> };

const bodySchema = z
  .object({
    complimentaryStay: z.boolean().optional(),
    amountBasis: z.enum(["NET", "GROSS"]).optional(),
  })
  .optional();

/** Explicit tax evaluation + append-only posting onto an existing Folio. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { folioId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const raw = await request.json().catch(() => ({}));
    const body = bodySchema.parse(raw) ?? {};

    const result = await evaluateAndPostFolioTaxesUseCase.execute(
      actor.tenantId,
      folioId,
      toPermissionActor(actor),
      {
        complimentaryStay: body.complimentaryStay,
        amountBasis: body.amountBasis,
      },
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }
    return apiSuccess(result.getValue());
  } catch (error) {
    return apiError(error);
  }
}
