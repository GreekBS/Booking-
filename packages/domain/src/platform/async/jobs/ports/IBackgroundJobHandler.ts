import type { BackgroundJobEntry } from "../../../../shared/types/index";

export interface IBackgroundJobHandler {
  canHandle(jobType: string): boolean;
  run(job: BackgroundJobEntry): Promise<void>;
}

export type JobLogFn = (job: BackgroundJobEntry) => void;
