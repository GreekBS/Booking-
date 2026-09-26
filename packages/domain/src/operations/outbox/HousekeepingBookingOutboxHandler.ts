import type { OutboxEntry } from "../../shared/types/index";
import type { IOutboxEventHandler } from "../../platform/async/ports/IOutboxEventHandler";
import type { ReconcileBookingTurnoverUseCase } from "../application/TurnoverUseCases";

const EVENTS = new Set([
  "BookingConfirmed",
  "BookingCancelled",
  "BookingStayChanged",
  "BookingUnitChanged",
]);

/**
 * Canonical Booking → operations turnover reconciliation.
 * Never touches providers / channel adapters.
 */
export class HousekeepingBookingOutboxHandler implements IOutboxEventHandler {
  constructor(private readonly reconcile: ReconcileBookingTurnoverUseCase) {}

  canHandle(eventType: string): boolean {
    return EVENTS.has(eventType);
  }

  async handle(entry: OutboxEntry): Promise<void> {
    const tenantId = entry.tenantId;
    if (!tenantId) {
      throw new Error("Housekeeping outbox entry missing tenantId");
    }
    const bookingId = entry.aggregateId;
    if (!bookingId) {
      return;
    }

    const cancel = entry.eventType === "BookingCancelled";
    const result = await this.reconcile.execute({
      tenantId,
      bookingId,
      cancel,
      actorUserId: null,
    });
    if (result.isFailure) {
      throw result.getError();
    }
  }
}
