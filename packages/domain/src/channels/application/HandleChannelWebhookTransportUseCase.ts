import type { IChannelProviderRegistry } from "../ports/providers/IChannelProviderRegistry";
import type { ChannelWebhookTransportRequest } from "../types/ChannelWebhookTransportRequest";
import type { ChannelWebhookTransportResult } from "../types/ChannelWebhookTransportResult";
import type { ReceiveChannelWebhookBatchUseCase } from "./ReceiveChannelWebhookBatchUseCase";
import {
  mapOrchestrationToTransportResult,
  mapThrownErrorToTransportResult,
  toWebhookRequestMeta,
} from "./ChannelWebhookTransportSupport";

/**
 * Provider-neutral webhook transport handler.
 * Converts an inbound HTTP-like request into ReceiveChannelWebhookBatchUseCase
 * and derives an ACK decision from durable Receive outcomes only.
 */
export class HandleChannelWebhookTransportUseCase {
  constructor(
    private readonly providerRegistry: IChannelProviderRegistry,
    private readonly webhookBatchUseCase: ReceiveChannelWebhookBatchUseCase,
  ) {}

  async execute(request: ChannelWebhookTransportRequest): Promise<ChannelWebhookTransportResult> {
    try {
      const registration = this.providerRegistry.get(request.provider);
      if (!registration?.capabilities.inbound.webhooks || !registration.webhooks) {
        return {
          ackAllowed: false,
          ackClassification: "ack_denied",
          failureKind: "unsupported_provider",
          retryClassification: "none",
          errorMessage: "Webhook provider is not registered",
          results: [],
          receivedMessageCount: 0,
          persistedMessageCount: 0,
        };
      }

      const orchestration = await this.webhookBatchUseCase.execute({
        tenantId: request.tenantId,
        connectionId: request.connectionId,
        provider: request.provider,
        request: toWebhookRequestMeta(request),
      });

      return mapOrchestrationToTransportResult(orchestration);
    } catch (error) {
      return mapThrownErrorToTransportResult(error);
    }
  }
}
