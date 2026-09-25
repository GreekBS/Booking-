import { NextRequest } from "next/server";
import { NotFoundError, ValidationError } from "@hcp/domain";
import {
  createChannelConnectionUseCase,
  putChannelConnectionCredentialsUseCase,
  getChannelConnectionUseCase,
} from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";
import { serializeOperatorConnection } from "@/lib/channels/operator-connection-response";
import { getBookingComPartnerAccessStatus } from "@/lib/channels/booking-com-operator-access";
import { z } from "zod";

const bodySchema = z
  .object({
    displayName: z.string().trim().min(1).max(255).optional(),
    resumeConnectionId: z.string().trim().min(1).max(255).optional(),
    /** Active Property workspace affinity (AP 1.2). Required when creating. */
    workspacePropertyId: z.string().uuid().optional(),
  })
  .strict();

/**
 * Begin or resume Booking.com setup.
 * Never accepts client_secret from the browser.
 * Fixture credentials are attached server-side only when fixture transport is enabled.
 */
export async function POST(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantId);
    if (!isChannelOperatorApiEnabled()) {
      throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
    }

    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const partner = getBookingComPartnerAccessStatus();
    const permissionActor = toPermissionActor(actor);
    const audit = { actorId: actor.userId, ipAddress: getClientIp(request) };

    if (body.resumeConnectionId) {
      const existingResult = await getChannelConnectionUseCase.execute(
        {
          tenantId: actor.tenantId,
          connectionId: body.resumeConnectionId,
        },
        permissionActor,
      );
      if (existingResult.isFailure) {
        return mapResultError(existingResult.getError());
      }
      const existing = existingResult.getValue();
      if (existing.provider !== "booking_com") {
        throw new NotFoundError("ChannelConnection", body.resumeConnectionId);
      }
      return apiSuccess({
        connection: serializeOperatorConnection(existing),
        partnerAccess: partner,
        resumed: true,
      });
    }

    const workspacePropertyId = body.workspacePropertyId?.trim() ?? "";
    if (!workspacePropertyId) {
      throw new ValidationError("workspacePropertyId is required");
    }

    const created = await createChannelConnectionUseCase.execute(
      {
        tenantId: actor.tenantId,
        provider: "booking_com",
        displayName: body.displayName ?? "Booking.com",
        workspacePropertyId,
      },
      permissionActor,
      audit,
    );
    if (created.isFailure) return mapResultError(created.getError());

    let connection = created.getValue();

    if (partner.fixtureTransportEnabled && !connection.hasCredentialRef) {
      const creds = await putChannelConnectionCredentialsUseCase.execute(
        {
          tenantId: actor.tenantId,
          connectionId: connection.connectionId,
          material: {
            client_id: "talos-local-fixture",
            client_secret: "talos-local-fixture-not-a-live-secret",
          },
        },
        permissionActor,
        audit,
      );
      if (creds.isFailure) return mapResultError(creds.getError());
      connection = creds.getValue();
    }

    return apiSuccess(
      {
        connection: serializeOperatorConnection(connection),
        partnerAccess: partner,
        resumed: false,
      },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
