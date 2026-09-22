import type { OutboxEntry } from "../../shared/types/index";
import type { IOutboxEventHandler } from "../../platform/async/ports/IOutboxEventHandler";
import type { EnqueueJobUseCase } from "../../platform/async/jobs/application/EnqueueJobUseCase";
import {
  BOOKING_COM_ARI_PUSH_OUTBOX_EVENT_TYPE,
  buildBookingComAriPushJobIdempotencyKey,
} from "../providers/booking_com/ari/bookingComAriOutboxIdentity";
import { PUSH_BOOKING_COM_ARI_JOB_TYPE } from "../../platform/async/jobs/types/JobTypes";

/**
 * Outbox → background job bridge. Never calls Booking.com HTTP.
 */
export class BookingComAriPushOutboxHandler implements IOutboxEventHandler {
  constructor(private readonly enqueueJobUseCase: EnqueueJobUseCase) {}

  canHandle(eventType: string): boolean {
    return eventType === BOOKING_COM_ARI_PUSH_OUTBOX_EVENT_TYPE;
  }

  async handle(entry: OutboxEntry): Promise<void> {
    const tenantId = entry.tenantId;
    if (!tenantId) {
      throw new Error("Booking.com ARI outbox entry missing tenantId");
    }
    const coalesceKey = entry.payload.coalesceKey;
    const generation = entry.payload.generation;
    if (typeof coalesceKey !== "string" || coalesceKey.trim().length === 0) {
      throw new Error("Booking.com ARI outbox payload missing coalesceKey");
    }
    if (typeof generation !== "number" || !Number.isInteger(generation) || generation < 1) {
      throw new Error("Booking.com ARI outbox payload missing generation");
    }

    const enqueued = await this.enqueueJobUseCase.execute({
      tenantId,
      jobType: PUSH_BOOKING_COM_ARI_JOB_TYPE,
      idempotencyKey: buildBookingComAriPushJobIdempotencyKey({
        coalesceKey: coalesceKey.trim(),
        generation,
      }),
      payload: {
        connectionId: entry.payload.connectionId,
        coalesceKey: coalesceKey.trim(),
        generation,
        monthKey: entry.payload.monthKey,
        hotelId: entry.payload.hotelId,
        fieldFamily: entry.payload.fieldFamily,
      },
    });
    if (enqueued.isFailure) {
      throw enqueued.getError();
    }
  }
}
