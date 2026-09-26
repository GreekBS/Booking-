import {
  ConflictError,
  type ChannelReservationImportCommit,
  type IChannelReservationImportPersistencePort,
} from "@hcp/domain";
import { withTenantTransaction } from "../../client";
import {
  PrismaOutboxRepository,
  saveAggregateWithOutbox,
} from "../OutboxRepository";
import { isExclusionViolation } from "../commerce/commerceMappers";
import { persistBookingTx, persistHoldTx, persistQuoteTx } from "../commerce/commercePersistence";
import {
  isUniqueConstraintViolation,
  persistExternalReservationLinkTx,
} from "./channelImportPersistence";

export class PrismaChannelReservationImportPersistence
  implements IChannelReservationImportPersistencePort
{
  constructor(private readonly outboxRepository: PrismaOutboxRepository) {}

  async runInTenantTransaction<T>(
    tenantId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return withTenantTransaction(tenantId, async () => fn());
  }

  async commitImport(params: ChannelReservationImportCommit): Promise<void> {
    const { hold, quote, booking, link } = params;
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
            await persistExternalReservationLinkTx(tx, link);
          },
        );
      });
    } catch (error) {
      if (isExclusionViolation(error)) {
        throw new ConflictError("Dates no longer available");
      }
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictError("External reservation link already exists for this connection");
      }
      throw error;
    }
  }
}
