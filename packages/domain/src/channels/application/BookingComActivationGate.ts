import type { IChannelConnectionProviderSetupRepository } from "../ports/IChannelProductMappingRepository";
import {
  assertBookingComSetupReadyForActivation,
  parseBookingComConnectionSetup,
} from "../providers/booking_com/setup/BookingComConnectionSetup";
import { ValidationError } from "../../shared/errors/DomainError";

/**
 * CM-4c-4 activation gate for Booking.com connections.
 */
export class BookingComActivationGate {
  constructor(
    private readonly setups: IChannelConnectionProviderSetupRepository,
  ) {}

  async assertReady(tenantId: string, connectionId: string): Promise<void> {
    const record = await this.setups.get(tenantId, connectionId);
    if (!record) {
      throw new ValidationError(
        "Booking.com setup is missing; complete mapping and initial sync before activation",
      );
    }
    const setup = parseBookingComConnectionSetup(record.setup);
    assertBookingComSetupReadyForActivation(setup);
  }
}
