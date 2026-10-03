import type { BackgroundJobEntry } from "../../shared/types/index";
import type { IBackgroundJobHandler } from "../../platform/async/jobs/ports/IBackgroundJobHandler";
import { EXPIRE_RESERVATION_IMPORT_DRAFTS_JOB_TYPE } from "../../platform/async/jobs/types/JobTypes";
import type { ExpireReservationImportDraftsUseCase } from "../import/ExpireReservationImportDraftsUseCase";

export type ExpireReservationImportDraftsJobLogFn = (entry: {
  jobId: string;
  expiredBatches: number;
  discardedRows: number;
  limit: number;
}) => void;

function parseLimit(payload: Record<string, unknown>): number {
  const raw = payload.limit;
  if (raw === undefined) {
    return 100;
  }
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error(
      "Invalid expire_reservation_import_drafts payload: limit must be an integer between 1 and 500",
    );
  }
  return limit;
}

export class ExpireReservationImportDraftsJobHandler implements IBackgroundJobHandler {
  constructor(
    private readonly expireUseCase: ExpireReservationImportDraftsUseCase,
    private readonly log: ExpireReservationImportDraftsJobLogFn = () => {},
  ) {}

  canHandle(jobType: string): boolean {
    return jobType === EXPIRE_RESERVATION_IMPORT_DRAFTS_JOB_TYPE;
  }

  async run(job: BackgroundJobEntry): Promise<void> {
    const limit = parseLimit(job.payload);
    const result = await this.expireUseCase.execute(new Date(), limit);
    if (result.isFailure) {
      throw result.getError();
    }
    const value = result.getValue();
    this.log({
      jobId: job.id,
      expiredBatches: value.expiredBatches,
      discardedRows: value.discardedRows,
      limit,
    });
  }
}
