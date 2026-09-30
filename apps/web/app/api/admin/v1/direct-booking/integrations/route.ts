import { NextRequest } from "next/server";
import { createDirectBookingIntegrationSchema } from "@hcp/validators";
import { createDirectBookingIntegrationUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";

/**
 * Operator provisioning for Direct Booking integrations.
 * Returns the public key once at creation — never again.
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    const body = createDirectBookingIntegrationSchema.parse(await request.json());

    const result = await createDirectBookingIntegrationUseCase.execute(
      {
        tenantId: actor.tenantId,
        propertyId: body.propertyId,
        unitId: body.unitId,
        environment: body.environment,
        allowedOrigins: body.allowedOrigins,
        status: body.status,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const { integration, publicKey } = result.getValue();
    return apiSuccess(
      {
        id: integration.id,
        propertyId: integration.propertyId,
        unitId: integration.unitId,
        environment: integration.environment,
        allowedOrigins: integration.allowedOrigins,
        status: integration.status,
        publicKeyPrefix: integration.publicKeyPrefix,
        publicKey,
        createdAt: integration.createdAt.toISOString(),
      },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
