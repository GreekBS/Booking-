import type { ExternalReservationLink } from "../domain/ExternalReservationLink";

export interface IExternalReservationLinkRepository {
  save(link: ExternalReservationLink): Promise<void>;
  findById(tenantId: string, linkId: string): Promise<ExternalReservationLink | null>;
  findByExternalReservation(
    tenantId: string,
    connectionId: string,
    externalReservationId: string,
  ): Promise<ExternalReservationLink | null>;
  findByBookingId(tenantId: string, bookingId: string): Promise<ExternalReservationLink | null>;
  listByBookingId(tenantId: string, bookingId: string): Promise<ExternalReservationLink[]>;
  listByConnection(tenantId: string, connectionId: string): Promise<ExternalReservationLink[]>;
}
