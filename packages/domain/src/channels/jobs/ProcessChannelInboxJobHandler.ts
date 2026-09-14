import type { BackgroundJobEntry } from "../../shared/types/index";
import type { IBackgroundJobHandler } from "../../platform/async/jobs/ports/IBackgroundJobHandler";
import { PROCESS_CHANNEL_INBOX_JOB_TYPE } from "../../platform/async/jobs/types/JobTypes";
import type { ProcessChannelInboxItemUseCase } from "../application/ProcessChannelInboxItemUseCase";

function parsePayload(payload: Record<string, unknown>): string {
  const inboxItemId = payload.inboxItemId;
  if (typeof inboxItemId !== "string" || inboxItemId.trim().length === 0) {
    throw new Error("Invalid process_channel_inbox payload: inboxItemId is required");
  }
  return inboxItemId.trim();
}

export class ProcessChannelInboxJobHandler implements IBackgroundJobHandler {
  constructor(
    private readonly processChannelInboxItemUseCase: ProcessChannelInboxItemUseCase,
    private readonly workerId: string,
  ) {}

  canHandle(jobType: string): boolean {
    return jobType === PROCESS_CHANNEL_INBOX_JOB_TYPE;
  }

  async run(job: BackgroundJobEntry): Promise<void> {
    const tenantId = job.tenantId;
    if (!tenantId) {
      throw new Error("process_channel_inbox job is missing tenantId");
    }
    const inboxItemId = parsePayload(job.payload);

    const result = await this.processChannelInboxItemUseCase.execute({
      tenantId,
      inboxItemId,
      workerId: this.workerId,
    });

    if (result.isFailure) {
      throw result.getError();
    }

    const value = result.getValue();
    if (value.shouldRetryJob) {
      throw new Error(value.outcome ?? "TRANSIENT_ERROR");
    }
  }
}
