import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type { IChannelConnectionProviderSetupRepository } from "../ports/IChannelProductMappingRepository";
import type {
  BookingComRemoteDiscoverySnapshot,
  IBookingComRemoteDiscoveryClient,
} from "../providers/booking_com/discovery/IBookingComRemoteDiscoveryClient";
import { parseBookingComConnectionSetup } from "../providers/booking_com/setup/BookingComConnectionSetup";

export interface DiscoverBookingComRemoteConfigCommand {
  tenantId: string;
  connectionId: string;
  /** Optional override; defaults to setup hotelId. */
  hotelId?: string;
}

/**
 * Remote discovery for mapping UI (CM-4c-5). Fake/fixture transport only.
 */
export class DiscoverBookingComRemoteConfigUseCase {
  constructor(
    private readonly connections: IChannelConnectionRepository,
    private readonly setups: IChannelConnectionProviderSetupRepository,
    private readonly discovery: IBookingComRemoteDiscoveryClient,
  ) {}

  async execute(
    command: DiscoverBookingComRemoteConfigCommand,
  ): Promise<Result<BookingComRemoteDiscoverySnapshot, Error>> {
    try {
      const connection = await this.connections.findById(
        command.tenantId,
        command.connectionId,
      );
      if (!connection || connection.provider !== "booking_com") {
        return Result.fail(new ValidationError("Booking.com connection required"));
      }

      let hotelId = command.hotelId?.trim() ?? "";
      if (!hotelId) {
        const setupRecord = await this.setups.get(
          command.tenantId,
          command.connectionId,
        );
        if (!setupRecord) {
          return Result.fail(new ValidationError("Provider setup not found"));
        }
        const setup = parseBookingComConnectionSetup(setupRecord.setup);
        if (!setup.hotelId) {
          return Result.fail(new ValidationError("Hotel binding required for discovery"));
        }
        hotelId = setup.hotelId;
      }

      const snapshot = await this.discovery.discover(hotelId);
      return Result.ok(snapshot);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
