import type { ChannelInboxIngressKind } from "../domain/ChannelInboxIngressKind";
import type { ChannelProviderMessage } from "../types/ChannelProviderMessage";
import type { ChannelIngressBatchResult } from "../types/ChannelIngressTypes";
import type { ReceiveChannelEventUseCase } from "./ReceiveChannelEventUseCase";
import type { ChannelInboxDeduplicationKey } from "../domain/value-objects/ChannelInboxDeduplicationKey";

export interface ChannelIngressTrustedMessage {
  readonly message: ChannelProviderMessage;
  readonly deduplicationKey: ChannelInboxDeduplicationKey;
}

export type ChannelIngressBatchItem = ChannelProviderMessage | ChannelIngressTrustedMessage;

export function isChannelIngressTrustedMessage(
  item: ChannelIngressBatchItem,
): item is ChannelIngressTrustedMessage {
  return (
    typeof item === "object" &&
    item !== null &&
    "deduplicationKey" in item &&
    "message" in item &&
    typeof (item as ChannelIngressTrustedMessage).message?.messageId === "string"
  );
}

export interface ChannelIngressBatchCommand {
  tenantId: string;
  connectionId: string;
  ingressKind: ChannelInboxIngressKind;
  items: readonly ChannelIngressBatchItem[];
}

export class ChannelIngressBatchProcessor {
  constructor(private readonly receiveChannelEventUseCase: ReceiveChannelEventUseCase) {}

  async processBatch(command: ChannelIngressBatchCommand): Promise<ChannelIngressBatchResult> {
    const results: ChannelIngressBatchResult["results"] = [];

    for (const item of command.items) {
      const message = isChannelIngressTrustedMessage(item) ? item.message : item;
      const receiveResult = await this.receiveChannelEventUseCase.execute({
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        ingressKind: command.ingressKind,
        message,
        deduplicationKey: isChannelIngressTrustedMessage(item)
          ? item.deduplicationKey
          : undefined,
      });

      if (receiveResult.isFailure) {
        results.push({
          messageId: message.messageId,
          success: false,
          errorMessage: receiveResult.getError().message,
        });
        continue;
      }

      const value = receiveResult.getValue();
      results.push({
        messageId: message.messageId,
        success: true,
        inboxItemId: value.inboxItemId,
        deduplicated: value.deduplicated,
      });
    }

    const ackAllowed =
      command.items.length === 0 || results.every((result) => result.success);

    return { ackAllowed, results };
  }
}
