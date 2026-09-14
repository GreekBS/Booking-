import { Result } from "../../../../shared/kernel/Result";
import type { BackgroundJobEntry, EnqueueJobCommand } from "../../../../shared/types/index";
import type { IJobScheduler } from "../ports/IJobScheduler";

export class EnqueueJobUseCase {
  constructor(private readonly jobScheduler: IJobScheduler) {}

  async execute(command: EnqueueJobCommand): Promise<Result<BackgroundJobEntry, Error>> {
    try {
      const job = await this.jobScheduler.schedule(command);
      return Result.ok(job);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
