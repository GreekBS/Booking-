import type { BackgroundJobEntry } from "../../shared/types/index";
import type { IBackgroundJobHandler } from "../../platform/async/jobs/ports/IBackgroundJobHandler";
import { PUSH_BOOKING_COM_ARI_JOB_TYPE } from "../../platform/async/jobs/types/JobTypes";
import {
  BookingComAriPermanentPushError,
  BookingComAriRetryablePushError,
  ExecuteBookingComAriPushUseCase,
} from "../application/ExecuteBookingComAriPushUseCase";

/**
 * Worker job: durable Booking.com ARI push with retry/backoff via job infrastructure.
 */
export class PushBookingComAriJobHandler implements IBackgroundJobHandler {
  constructor(private readonly executePush: ExecuteBookingComAriPushUseCase) {}

  canHandle(jobType: string): boolean {
    return jobType === PUSH_BOOKING_COM_ARI_JOB_TYPE;
  }

  async run(job: BackgroundJobEntry): Promise<void> {
    const tenantId = job.tenantId;
    if (!tenantId) {
      throw new Error("push_booking_com_ari job missing tenantId");
    }
    const connectionId = job.payload.connectionId;
    const coalesceKey = job.payload.coalesceKey;
    const generation = job.payload.generation;
    if (typeof connectionId !== "string" || connectionId.trim().length === 0) {
      throw new Error("push_booking_com_ari payload missing connectionId");
    }
    if (typeof coalesceKey !== "string" || coalesceKey.trim().length === 0) {
      throw new Error("push_booking_com_ari payload missing coalesceKey");
    }
    if (typeof generation !== "number" || !Number.isInteger(generation)) {
      throw new Error("push_booking_com_ari payload missing generation");
    }

    const result = await this.executePush.execute({
      tenantId,
      connectionId: connectionId.trim(),
      coalesceKey: coalesceKey.trim(),
      generation,
    });

    if (result.isFailure) {
      const err = result.getError();
      if (err instanceof BookingComAriPermanentPushError) {
        // Surface as permanent — ProcessJobBatch will dead-letter after max attempts;
        // message prefix helps operators.
        throw new Error(`PERMANENT:${err.message}`);
      }
      if (err instanceof BookingComAriRetryablePushError) {
        throw err;
      }
      throw err;
    }
  }
}
