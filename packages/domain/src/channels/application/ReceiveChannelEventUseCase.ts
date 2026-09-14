import type { ChannelInboxIngressKind } from "../domain/ChannelInboxIngressKind";
import { ChannelInboxItem } from "../domain/ChannelInboxItem";
import { ChannelInboxDeduplicationKey } from "../domain/value-objects/ChannelInboxDeduplicationKey";
import type { ChannelProviderMessage } from "../types/ChannelProviderMessage";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import { EnqueueJobUseCase } from "../../platform/async/jobs/application/EnqueueJobUseCase";
import { PROCESS_CHANNEL_INBOX_JOB_TYPE } from "../../platform/async/jobs/types/JobTypes";
import type { IChannelInboxRepository } from "../ports/IChannelInboxRepository";

export interface ReceiveChannelEventCommand {
  tenantId: string;
  connectionId: string;
  ingressKind: ChannelInboxIngressKind;
  message: ChannelProviderMessage;
  correlationId?: string | null;
  deduplicationKey?: ChannelInboxDeduplicationKey;
}

export interface ReceiveChannelEventResult {
  inboxItemId: string;
  deduplicated: boolean;
  jobId: string;
}

export class ReceiveChannelEventUseCase {
  constructor(
    private readonly inboxRepository: IChannelInboxRepository,
    private readonly enqueueJobUseCase: EnqueueJobUseCase,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(
    command: ReceiveChannelEventCommand,
  ): Promise<Result<ReceiveChannelEventResult, Error>> {
    try {
      const tenantId = normalizeRequired(command.tenantId, "Tenant id");
      const connectionId = normalizeRequired(command.connectionId, "Connection id");
      const message = command.message;

      if (message.connectionId !== connectionId) {
        return Result.fail(new ValidationError("Message connection id does not match command"));
      }

      const deduplicationKey =
        command.deduplicationKey ??
        ChannelInboxDeduplicationKey.forIngressMessage(connectionId, message);

      const inboxItem = ChannelInboxItem.createNew({
        id: this.idGenerator.generate(),
        tenantId,
        connectionId,
        provider: message.provider,
        ingressKind: command.ingressKind,
        message,
        deduplicationKey,
        correlationId: command.correlationId ?? null,
      });

      const insertResult = await this.inboxRepository.insert(inboxItem);
      const persistedItem = insertResult.item;

      const jobResult = await this.enqueueJobUseCase.execute({
        tenantId,
        jobType: PROCESS_CHANNEL_INBOX_JOB_TYPE,
        payload: { inboxItemId: persistedItem.id },
        idempotencyKey: persistedItem.id,
      });

      if (jobResult.isFailure) {
        return Result.fail(jobResult.getError());
      }

      return Result.ok({
        inboxItemId: persistedItem.id,
        deduplicated: !insertResult.inserted,
        jobId: jobResult.getValue().id,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function normalizeRequired(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required`);
  }
  return trimmed;
}
