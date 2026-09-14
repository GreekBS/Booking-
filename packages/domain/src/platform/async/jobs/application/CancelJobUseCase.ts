import { Result } from "../../../../shared/kernel/Result";
import type { IJobScheduler } from "../ports/IJobScheduler";

export class CancelJobUseCase {
  constructor(private readonly jobScheduler: IJobScheduler) {}

  async execute(jobId: string): Promise<Result<void, Error>> {
    try {
      await this.jobScheduler.cancel(jobId);
      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
