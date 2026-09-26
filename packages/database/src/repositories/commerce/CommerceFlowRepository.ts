import { ConflictError, type ICommerceFlowRepository } from "@hcp/domain";
import type { Hold, Booking, Quote } from "@hcp/domain";
import { withTenantTransaction } from "../../client";
import {
  PrismaOutboxRepository,
  saveAggregateWithOutbox,
} from "../OutboxRepository";
import { isExclusionViolation } from "./commerceMappers";
import { persistBookingTx, persistHoldTx, persistQuoteTx } from "./commercePersistence";

export class PrismaCommerceFlowRepository implements ICommerceFlowRepository {
  constructor(private readonly outboxRepository: PrismaOutboxRepository) {}

  async runInTenantTransaction<T>(
    tenantId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return withTenantTransaction(tenantId, async () => fn());
  }

  async saveHoldAndBooking(hold: Hold, booking: Booking): Promise<void> {
    const holdEvents = hold.pullDomainEvents();
    const bookingEvents = booking.pullDomainEvents();

    try {
      await withTenantTransaction(hold.tenantId, async () => {
        await saveAggregateWithOutbox(
          this.outboxRepository,
          [...holdEvents, ...bookingEvents],
          async (tx) => {
            await persistHoldTx(tx, hold);
            await persistBookingTx(tx, booking);
          },
        );
      });
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictError("Dates no longer available");
      }
      throw error;
    }
  }

  async saveStayChange(quote: Quote, booking: Booking): Promise<void> {
    const quoteEvents = quote.pullDomainEvents();
    const bookingEvents = booking.pullDomainEvents();

    try {
      await withTenantTransaction(quote.tenantId, async () => {
        await saveAggregateWithOutbox(
          this.outboxRepository,
          [...quoteEvents, ...bookingEvents],
          async (tx) => {
            await persistQuoteTx(tx, quote);
            await persistBookingTx(tx, booking);
          },
        );
      });
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictError("Dates no longer available");
      }
      throw error;
    }
  }

  async saveImportReservation(hold: Hold, quote: Quote, booking: Booking): Promise<void> {
    const holdEvents = hold.pullDomainEvents();
    const quoteEvents = quote.pullDomainEvents();
    const bookingEvents = booking.pullDomainEvents();

    try {
      await withTenantTransaction(hold.tenantId, async () => {
        await saveAggregateWithOutbox(
          this.outboxRepository,
          [...holdEvents, ...quoteEvents, ...bookingEvents],
          async (tx) => {
            await persistHoldTx(tx, hold);
            await persistQuoteTx(tx, quote);
            await persistBookingTx(tx, booking);
          },
        );
      });
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictError("Dates no longer available");
      }
      throw error;
    }
  }
}
