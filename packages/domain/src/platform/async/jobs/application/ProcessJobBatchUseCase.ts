import { Result } from "../../../../shared/kernel/Result";
import type {
  ClaimJobBatchFilter,
  ProcessJobBatchResult,
} from "../../../../shared/types/index";
import type { IBackgroundJobRepository } from "../ports/IBackgroundJobRepository";
import type { JobHandlerRegistry } from "../handlers/JobHandlerRegistry";

export class ProcessJobBatchUseCase {
  constructor(
    private readonly jobRepository: IBackgroundJobRepository,
    private readonly handlerRegistry: JobHandlerRegistry,
  ) {}

  async execute(
    limit: number,
    filter?: ClaimJobBatchFilter,
  ): Promise<Result<ProcessJobBatchResult, Error>> {
    try {
      const claimed = await this.jobRepository.claimBatch(limit, filter);

      let completed = 0;
      let retried = 0;
      let deadLettered = 0;

      for (const job of claimed) {
        const handler = this.handlerRegistry.resolve(job.jobType);
        if (!handler) {
          const disposition = await this.jobRepository.markFailed(
            job.id,
            `No handler registered for job type: ${job.jobType}`,
          );
          if (disposition === "dead_letter") {
            deadLettered += 1;
          } else {
            retried += 1;
          }
          continue;
        }

        try {
          await handler.run(job);
          await this.jobRepository.markCompleted(job.id);
          completed += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const disposition = await this.jobRepository.markFailed(job.id, message);
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
