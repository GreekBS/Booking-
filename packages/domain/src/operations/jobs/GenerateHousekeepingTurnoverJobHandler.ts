import type { BackgroundJobEntry } from "../../shared/types/index";
import type { IBackgroundJobHandler } from "../../platform/async/jobs/ports/IBackgroundJobHandler";
import { GENERATE_HOUSEKEEPING_TURNOVER_JOB_TYPE } from "../../platform/async/jobs/types/JobTypes";
import type { GenerateHousekeepingTurnoverUseCase } from "../application/TurnoverUseCases";

function parseLimit(payload: Record<string, unknown>): number {
  const raw = payload.limit;
  if (raw === undefined) return 200;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error(
      "Invalid generate_housekeeping_turnover payload: limit must be 1..500",
    );
  }
  return limit;
}

export class GenerateHousekeepingTurnoverJobHandler
  implements IBackgroundJobHandler
{
  constructor(
    private readonly useCase: GenerateHousekeepingTurnoverUseCase,
    private readonly log: (entry: {
      jobId: string;
      scanned: number;
      created: number;
      markedDirty: number;
      errors: number;
    }) => void = () => {},
  ) {}

  canHandle(jobType: string): boolean {
    return jobType === GENERATE_HOUSEKEEPING_TURNOVER_JOB_TYPE;
  }

  async run(job: BackgroundJobEntry): Promise<void> {
    const limit = parseLimit(job.payload);
    const result = await this.useCase.execute(new Date(), limit);
    if (result.isFailure) {
      throw result.getError();
    }
    const value = result.getValue();
    this.log({
      jobId: job.id,
      scanned: value.scanned,
      created: value.created,
      markedDirty: value.markedDirty,
      errors: value.errors,
    });
  }
}
