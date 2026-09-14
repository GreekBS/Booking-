import { NextRequest, NextResponse } from "next/server";
import {
  createChannelWebhookTransportRequest,
  type ChannelSource,
} from "@hcp/domain";
import { channelWebhookRouteParamsSchema } from "@hcp/validators";
import { handleChannelWebhookTransportUseCase } from "@/lib/di/container";
import { isChannelWebhookApiEnabled } from "@/lib/channels/webhook-api";
import {
  collectWebhookHeaders,
  readWebhookRawBody,
} from "@/lib/channels/webhook-raw-body";
import { mapWebhookTransportResultToHttp } from "@/lib/channels/webhook-http-mapping";
import { checkChannelWebhookRateLimit } from "@/lib/channels/channel-transport-rate-limit";
import { apiError } from "@/lib/api-error-handler";
import { createLogger } from "@/lib/logging/logger";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ provider: string; tenantId: string; connectionId: string }>;
};

const logger = createLogger({ action: "channels.webhook" });

/**
 * CM-4b S4a-2b — public channel webhook ingress.
 * No session auth. Provider authenticity is established inside transport verification.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  if (!isChannelWebhookApiEnabled()) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 },
    );
  }

  const started = Date.now();
  let provider = "unknown";
  let tenantId = "unknown";
  let connectionId = "unknown";

  try {
    const rawParams = await context.params;
    const parsed = channelWebhookRouteParamsSchema.safeParse(rawParams);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Not found" } },
        { status: 404 },
      );
    }

    provider = parsed.data.provider;
    tenantId = parsed.data.tenantId;
    connectionId = parsed.data.connectionId;

    checkChannelWebhookRateLimit(request);

    const rawBodyBytes = await readWebhookRawBody(request);
    const headers = collectWebhookHeaders(request);

    const transportRequest = createChannelWebhookTransportRequest({
      tenantId,
      connectionId,
      provider: provider as ChannelSource,
      method: request.method,
      headers,
      rawBodyBytes,
      routeParameters: {
        provider,
        tenantId,
        connectionId,
      },
      receivedAt: new Date(),
    });

    const result = await handleChannelWebhookTransportUseCase.execute(transportRequest);
    const response = mapWebhookTransportResultToHttp(result);

    logger.info("webhook transport completed", {
      provider,
      tenantId,
      connectionId,
      status: response.status,
      ackAllowed: result.ackAllowed,
      failureKind: result.failureKind ?? null,
      receivedMessageCount: result.receivedMessageCount,
      durationMs: Date.now() - started,
    });

    return response;
  } catch (error) {
    logger.info("webhook transport failed", {
      provider,
      tenantId,
      connectionId,
      durationMs: Date.now() - started,
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return apiError(error);
  }
}
