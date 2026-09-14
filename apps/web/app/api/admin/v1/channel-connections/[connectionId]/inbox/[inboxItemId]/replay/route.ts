import { NextRequest } from "next/server";
import { NotFoundError } from "@hcp/domain";
import {
  channelInboxReplayRouteParamsSchema,
  emptyStrictBodySchema,
} from "@hcp/validators";
import { replayChannelConnectionInboxItemUseCase } from "@/lib/di/container";
import {
  requireTenantContext,
  toPermissionActor,
  getClientIp,
} from "@/lib/tenant-context";
import { apiError, apiSuccess, mapResultError } from "@/lib/api-error-handler";
import { isChannelOperatorApiEnabled } from "@/lib/channels/operator-api";
import { isChannelInboxReplayApiEnabled } from "@/lib/channels/inbox-replay-api";
import { checkChannelAdminTransportRateLimit } from "@/lib/channels/channel-transport-rate-limit";
import { createLogger } from "@/lib/logging/logger";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ connectionId: string; inboxItemId: string }>;
};

const logger = createLogger({ action: "channels.inbox_replay" });

function assertOperatorApiEnabled(): void {
  if (!isChannelOperatorApiEnabled()) {
    throw new NotFoundError("ChannelConnectionOperatorApi", "disabled");
  }
}

function assertReplayApiEnabled(): void {
  if (!isChannelInboxReplayApiEnabled()) {
    throw new NotFoundError("ChannelInboxReplayApi", "disabled");
  }
}

/**
 * CM-4b S4a-2b — replay inbox item via ReplayChannelInboxItemUseCase (new row).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const tenantHeader = request.headers.get("x-tenant-id");
    const actor = await requireTenantContext(tenantHeader);
    assertOperatorApiEnabled();
    assertReplayApiEnabled();

    const rawParams = await context.params;
    const params = channelInboxReplayRouteParamsSchema.parse(rawParams);

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
      "replay",
    );

    const result = await replayChannelConnectionInboxItemUseCase.execute(
      {
        tenantId: actor.tenantId,
        connectionId: params.connectionId,
        inboxItemId: params.inboxItemId,
      },
      toPermissionActor(actor),
    );

    if (result.isFailure) {
      return mapResultError(result.getError());
    }

    const value = result.getValue();
    logger.info("inbox replay accepted", {
      tenantId: actor.tenantId,
      connectionId: params.connectionId,
      inboxItemId: params.inboxItemId,
      newInboxItemId: value.inboxItemId,
      deduplicated: value.deduplicated,
      actorId: actor.userId,
      ipAddress: getClientIp(request),
    });

    return apiSuccess({
      inboxItemId: value.inboxItemId,
      deduplicated: value.deduplicated,
    });
  } catch (error) {
    return apiError(error);
  }
}
