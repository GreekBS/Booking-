import type { BackgroundJobEntry } from "../../shared/types/index";
import type { IBackgroundJobHandler } from "../../platform/async/jobs/ports/IBackgroundJobHandler";
import { SWEEP_PENDING_ICAL_INVENTORY_RECONCILE_JOB_TYPE } from "../../platform/async/jobs/types/JobTypes";
import type { SweepPendingIcalInventoryReconcileUseCase } from "../application/SweepPendingIcalInventoryReconcileUseCase";

export class SweepPendingIcalInventoryReconcileJobHandler implements IBackgroundJobHandler {
  constructor(private readonly useCase: SweepPendingIcalInventoryReconcileUseCase) {}

  canHandle(jobType: string): boolean {
    return jobType === SWEEP_PENDING_ICAL_INVENTORY_RECONCILE_JOB_TYPE;
  }

  async run(job: BackgroundJobEntry): Promise<void> {
    void job;
    const result = await this.useCase.execute();
    if (result.isFailure) {
      throw result.getError();
    }
  }
}
