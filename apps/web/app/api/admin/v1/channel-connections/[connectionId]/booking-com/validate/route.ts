import { NextRequest } from "next/server";
import { NotFoundError, ValidationError } from "@hcp/domain";
import {
  getChannelConnectionUseCase,
  validateBookingComMappingsUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";
import { z } from "zod";

type RouteContext = { params: Promise<{ connectionId: string }> };

const bodySchema = z
  .object({
    expectedPropertyId: z.string().trim().min(1).max(255).nullable().optional(),
    includeDiscovery: z.boolean().optional(),
    activeUnitIds: z.array(z.string().trim().min(1).max(255)).max(200),
    activeRatePlanIds: z.array(z.string().trim().min(1).max(255)).max(200),
    unitPropertyIds: z.record(z.string().trim().min(1).max(255)).optional(),
  })
  .strict();

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { connectionId } = await context.params;
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    if (!isChannelOperatorApiEnabled()) {
      throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
    }

    const connectionResult = await getChannelConnectionUseCase.execute(
      { tenantId: actor.tenantId, connectionId },
      toPermissionActor(actor),
    );
    if (connectionResult.isFailure) {
      return mapResultError(connectionResult.getError());
    }
    if (connectionResult.getValue().provider !== "booking_com") {
      throw new ValidationError("Connection is not a Booking.com connection");
    }

    const body = bodySchema.parse(await request.json());
    const unitPropertyIds = new Map<string, string>(
      Object.entries(body.unitPropertyIds ?? {}),
    );

    const result = await validateBookingComMappingsUseCase.execute({
      tenantId: actor.tenantId,
      connectionId,
      expectedPropertyId: body.expectedPropertyId ?? null,
      activeUnitIds: body.activeUnitIds,
      activeRatePlanIds: body.activeRatePlanIds,
      unitPropertyIds,
      includeDiscovery: body.includeDiscovery === true,
    });
    if (result.isFailure) return mapResultError(result.getError());

    const value = result.getValue();
    return apiSuccess({
      ok: value.ok,
      blocking: value.blocking,
      warnings: value.warnings,
    });
  } catch (error) {
    return apiError(error);
  }
}
