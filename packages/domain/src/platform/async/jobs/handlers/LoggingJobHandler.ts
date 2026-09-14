import type { BackgroundJobEntry } from "../../../../shared/types/index";
import { LOGGING_PING_JOB_TYPE } from "../types/JobTypes";
import type { IBackgroundJobHandler, JobLogFn } from "../ports/IBackgroundJobHandler";

export class LoggingJobHandler implements IBackgroundJobHandler {
  constructor(private readonly log: JobLogFn = () => {}) {}

  canHandle(jobType: string): boolean {
    return jobType === LOGGING_PING_JOB_TYPE;
  }

  async run(job: BackgroundJobEntry): Promise<void> {
    this.log(job);
  }
}
