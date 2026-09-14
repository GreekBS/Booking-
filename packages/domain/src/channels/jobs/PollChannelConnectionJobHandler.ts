import type { BackgroundJobEntry } from "../../shared/types/index";
import type { IBackgroundJobHandler } from "../../platform/async/jobs/ports/IBackgroundJobHandler";
import { POLL_CHANNEL_CONNECTION_JOB_TYPE } from "../../platform/async/jobs/types/JobTypes";
import type { ExecuteChannelPollConnectionUseCase } from "../application/ExecuteChannelPollConnectionUseCase";

function parsePayload(payload: Record<string, unknown>): string {
  const connectionId = payload.connectionId;
  if (typeof connectionId !== "string" || connectionId.trim().length === 0) {
    throw new Error("Invalid poll_channel_connection payload: connectionId is required");
  }
  return connectionId.trim();
}

export class PollChannelConnectionJobHandler implements IBackgroundJobHandler {
  constructor(
    private readonly executePollConnectionUseCase: ExecuteChannelPollConnectionUseCase,
  ) {}

  canHandle(jobType: string): boolean {
    return jobType === POLL_CHANNEL_CONNECTION_JOB_TYPE;
  }

  async run(job: BackgroundJobEntry): Promise<void> {
    const tenantId = job.tenantId;
    if (!tenantId) {
      throw new Error("poll_channel_connection job is missing tenantId");
    }

    const connectionId = parsePayload(job.payload);

    const result = await this.executePollConnectionUseCase.execute({
      tenantId,
      connectionId,
    });

    if (result.shouldRetryJob) {
      throw new Error(result.errorMessage ?? "POLL_TRANSIENT_RETRY");
    }
  }
}
