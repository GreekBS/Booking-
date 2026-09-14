import { Result } from "../../../shared/kernel/Result";
import type { IOutboxRepository } from "../../../shared/ports/InfrastructurePorts";
import type { ProcessOutboxBatchResult } from "../../../shared/types/index";
import type { OutboxHandlerRegistry } from "../handlers/OutboxHandlerRegistry";

export interface ProcessOutboxBatchOptions {
  maxAttempts?: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;

export class ProcessOutboxBatchUseCase {
  constructor(
    private readonly outboxRepository: IOutboxRepository,
    private readonly handlerRegistry: OutboxHandlerRegistry,
    private readonly options: ProcessOutboxBatchOptions = {},
  ) {}

  async execute(limit: number): Promise<Result<ProcessOutboxBatchResult, Error>> {
    try {
      const maxAttempts = this.options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
      const claimed = await this.outboxRepository.claimBatch(limit);

      let completed = 0;
      let retried = 0;
      let deadLettered = 0;

      for (const entry of claimed) {
        const handler = this.handlerRegistry.resolve(entry.eventType);
        if (!handler) {
          const disposition = await this.outboxRepository.markFailed(
            entry.id,
            `No handler registered for event type: ${entry.eventType}`,
            maxAttempts,
          );
          if (disposition === "dead_letter") {
            deadLettered += 1;
          } else {
            retried += 1;
          }
          continue;
        }

        try {
          await handler.handle(entry);
          await this.outboxRepository.markCompleted(entry.id);
          completed += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const disposition = await this.outboxRepository.markFailed(
            entry.id,
            message,
            maxAttempts,
          );
          if (disposition === "dead_letter") {
            deadLettered += 1;
          } else {
            retried += 1;
          }
        }
      }

      return Result.ok({
        claimed: claimed.length,
        completed,
        retried,
        deadLettered,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
