import type { BackgroundJobEntry, EnqueueJobCommand } from "../../../../shared/types/index";

export interface IJobScheduler {
  schedule(command: EnqueueJobCommand): Promise<BackgroundJobEntry>;
  cancel(jobId: string): Promise<void>;
}
