import type { BackgroundJobEntry } from "../../shared/types/index";
import type { IBackgroundJobHandler } from "../../platform/async/jobs/ports/IBackgroundJobHandler";
import { EXPIRE_HOLDS_JOB_TYPE } from "../../platform/async/jobs/types/JobTypes";
import type { ExpireHoldsUseCase } from "../application/CommerceUseCases";

export interface ExpireHoldsJobPayload {
  limit?: number;
}

export type ExpireHoldsJobLogFn = (entry: {
  jobId: string;
  expired: number;
  limit: number;
}) => void;

function parseLimit(payload: Record<string, unknown>): number {
  const raw = payload.limit;
  if (raw === undefined) {
    return 100;
  }
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("Invalid expire_holds payload: limit must be an integer between 1 and 500");
  }
  return limit;
}

export class ExpireHoldsJobHandler implements IBackgroundJobHandler {
  constructor(
    private readonly expireHoldsUseCase: ExpireHoldsUseCase,
    private readonly log: ExpireHoldsJobLogFn = () => {},
  ) {}

  canHandle(jobType: string): boolean {
    return jobType === EXPIRE_HOLDS_JOB_TYPE;
  }

  async run(job: BackgroundJobEntry): Promise<void> {
    const limit = parseLimit(job.payload);
    const result = await this.expireHoldsUseCase.execute(new Date(), limit);

    if (result.isFailure) {
      throw result.getError();
    }

    this.log({
      jobId: job.id,
      expired: result.getValue().expired,
      limit,
    });
  }
}
