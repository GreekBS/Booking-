import { NextRequest } from "next/server";
import { NotFoundError } from "@hcp/domain";
import {
  channelConnectionIdParamSchema,
  emptyStrictBodySchema,
} from "@hcp/validators";
import { enqueueChannelConnectionPollUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";
import { isChannelsPollingEnabled } from "@/lib/channels/polling-enabled";
import { checkChannelAdminTransportRateLimit } from "@/lib/channels/channel-transport-rate-limit";
import { createLogger } from "@/lib/logging/logger";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ connectionId: string }> };

const logger = createLogger({ action: "channels.manual_poll" });

function assertOperatorApiEnabled(): void {
  if (!isChannelOperatorApiEnabled()) {
    throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
  }
}

function assertPollingEnabled(): void {
  if (!isChannelsPollingEnabled()) {
    throw new NotFoundError("ChannelPollingApi", "disabled");
  }
}

/**
 * CM-4b S4a-2b — enqueue poll_channel_connection (never synchronous poll).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const tenantHeader = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantHeader);
    assertOperatorApiEnabled();
    assertPollingEnabled();

    const rawParams = await context.params;
    const params = channelConnectionIdParamSchema.parse(rawParams);

    const contentType = request.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      const text = await request.text();
      if (text.trim().length > 0) {
        emptyStrictBodySchema.parse(JSON.parse(text));
      }
    }

    checkChannelAdminTransportRateLimit(
      request,
      actor.tenantId,
      params.connectionId,
      "poll",
    );

    const result = await enqueueChannelConnectionPollUseCase.execute(
      {
        tenantId: actor.tenantId,
        connectionId: params.connectionId,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const { job } = result.getValue();
    logger.info("manual poll enqueued", {
      tenantId: actor.tenantId,
      connectionId: params.connectionId,
      jobId: job.id,
      jobStatus: job.status,
      actorId: actor.userId,
      ipAddress: getClientIp(request),
    });

    return apiSuccess(
      {
        status: "queued",
        jobId: job.id,
        jobStatus: job.status,
      },
      202,
    );
  } catch (error) {
    return apiError(error);
  }
}
