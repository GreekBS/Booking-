import { NextRequest } from "next/server";
import { NotFoundError } from "@hcp/domain";
import {
  createChannelConnectionUseCase,
  putChannelConnectionCredentialsUseCase,
  listChannelConnectionsUseCase,
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
      const listed = await listChannelConnectionsUseCase.execute(
        { tenantId: actor.tenantId },
        permissionActor,
      );
      if (listed.isFailure) return mapResultError(listed.getError());
      const existing = listed
        .getValue()
        .find(
          (c) =>
            c.connectionId === body.resumeConnectionId &&
            c.provider === "booking_com",
        );
      if (!existing) {
        throw new NotFoundError("ChannelConnection", body.resumeConnectionId);
      }
      return apiSuccess({
        connection: serializeOperatorConnection(existing),
        partnerAccess: partner,
        resumed: true,
      });
    }

    const created = await createChannelConnectionUseCase.execute(
      {
        tenantId: actor.tenantId,
        provider: "booking_com",
        displayName: body.displayName ?? "Booking.com",
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
