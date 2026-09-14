// Positive fixture — only allow-listed transport dependencies.
import { ReceiveChannelEventUseCase } from "../../src/channels/application/ReceiveChannelEventUseCase";
import type { ChannelIngressBatchResult } from "../../src/channels/types/ChannelIngressTypes";
import type { ChannelWebhookAckDisposition } from "../../src/channels/types/ChannelWebhookTransportTypes";

export type ValidTransportFixture = {
  receive: typeof ReceiveChannelEventUseCase;
  batch: ChannelIngressBatchResult;
  ack: ChannelWebhookAckDisposition;
};
