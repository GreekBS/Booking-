import type { Booking } from "../../commerce/booking/domain/Booking";
import type { Hold } from "../../commerce/booking/domain/Hold";
import type { Quote } from "../../commerce/booking/domain/Quote";
import type { ExternalReservationLink } from "../domain/ExternalReservationLink";

export interface ChannelReservationImportCommit {
  hold: Hold;
  quote: Quote;
  booking: Booking;
  link: ExternalReservationLink;
}

export interface IChannelReservationImportPersistencePort {
  /** Run fn inside the tenant write transaction (ALS). Nested commits join this TX. */
  runInTenantTransaction<T>(tenantId: string, fn: () => Promise<T>): Promise<T>;
  commitImport(params: ChannelReservationImportCommit): Promise<void>;
}
