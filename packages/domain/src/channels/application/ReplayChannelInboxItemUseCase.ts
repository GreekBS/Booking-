import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import { REPLAYABLE_INBOX_STATUSES } from "../domain/ChannelInboxProcessingStatus";
import { ChannelInboxDeduplicationKey } from "../domain/value-objects/ChannelInboxDeduplicationKey";
import { parseChannelInboxRawPayload } from "./ChannelInboxMessageParser";
import type { ReceiveChannelEventResult } from "./ReceiveChannelEventUseCase";
import { ReceiveChannelEventUseCase } from "./ReceiveChannelEventUseCase";
import type { IChannelInboxRepository } from "../ports/IChannelInboxRepository";

export interface ReplayChannelInboxItemCommand {
  tenantId: string;
  sourceInboxItemId: string;
  correlationId?: string | null;
}

export class ReplayChannelInboxItemUseCase {
  constructor(
    private readonly inboxRepository: IChannelInboxRepository,
    private readonly receiveChannelEventUseCase: ReceiveChannelEventUseCase,
  ) {}

  async execute(
    command: ReplayChannelInboxItemCommand,
  ): Promise<Result<ReceiveChannelEventResult, Error>> {
    try {
      const tenantId = command.tenantId.trim();
      const sourceInboxItemId = command.sourceInboxItemId.trim();
      const source = await this.inboxRepository.findById(tenantId, sourceInboxItemId);
      if (!source) {
        return Result.fail(new ValidationError("Source inbox item not found"));
      }
      if (!REPLAYABLE_INBOX_STATUSES.has(source.status)) {
        return Result.fail(
          new ValidationError(`Source inbox item is not replayable from status: ${source.status}`),
        );
      }

      const message = parseChannelInboxRawPayload(source.rawPayload);
      const replaySequence =
        (await this.inboxRepository.countReplayItemsForSource(tenantId, sourceInboxItemId)) + 1;
      const deduplicationKey = ChannelInboxDeduplicationKey.forReplay(
        sourceInboxItemId,
        replaySequence,
      );

      return this.receiveChannelEventUseCase.execute({
        tenantId,
        connectionId: source.connectionId,
        ingressKind: "replay",
        message,
        correlationId: command.correlationId ?? source.id,
        deduplicationKey,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
