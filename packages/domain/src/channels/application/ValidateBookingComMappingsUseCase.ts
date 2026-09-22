import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type {
  IChannelConnectionProviderSetupRepository,
  IChannelProductMappingRepository,
} from "../ports/IChannelProductMappingRepository";
import {
  validateBookingComMappings,
  type BookingComMappingValidationResult,
} from "../providers/booking_com/mapping/validateBookingComMappings";
import {
  parseBookingComConnectionSetup,
} from "../providers/booking_com/setup/BookingComConnectionSetup";
import type { IBookingComRemoteDiscoveryClient } from "../providers/booking_com/discovery/IBookingComRemoteDiscoveryClient";
import {
  BOOKING_COM_MAPPING_EVENTS,
  emitBookingComMappingEvent,
  type BookingComMappingLogFn,
} from "../providers/booking_com/sync/bookingComAriDiff";

export interface ValidateBookingComMappingsCommand {
  tenantId: string;
  connectionId: string;
  expectedPropertyId?: string | null;
  activeUnitIds: readonly string[];
  activeRatePlanIds: readonly string[];
  unitPropertyIds: ReadonlyMap<string, string>;
  includeDiscovery?: boolean;
}

export class ValidateBookingComMappingsUseCase {
  constructor(
    private readonly connections: IChannelConnectionRepository,
    private readonly setups: IChannelConnectionProviderSetupRepository,
    private readonly mappings: IChannelProductMappingRepository,
    private readonly discovery: IBookingComRemoteDiscoveryClient | null = null,
    private readonly log: BookingComMappingLogFn = () => {},
  ) {}

  async execute(
    command: ValidateBookingComMappingsCommand,
  ): Promise<Result<BookingComMappingValidationResult, Error>> {
    try {
      const connection = await this.connections.findById(
        command.tenantId,
        command.connectionId,
      );
      if (!connection || connection.provider !== "booking_com") {
        return Result.fail(new ValidationError("Booking.com connection required"));
      }

      const setupRecord = await this.setups.get(
        command.tenantId,
        command.connectionId,
      );
      const setup = setupRecord
        ? parseBookingComConnectionSetup(setupRecord.setup)
        : null;
      const mappings = await this.mappings.listByConnection(
        command.tenantId,
        command.connectionId,
      );

      let discovery = null;
      if (command.includeDiscovery && this.discovery && setup?.hotelId) {
        discovery = await this.discovery.discover(setup.hotelId);
      }

      const result = validateBookingComMappings({
        mappings,
        expectedPropertyId: command.expectedPropertyId ?? null,
        activeUnitIds: new Set(command.activeUnitIds),
        activeRatePlanIds: new Set(command.activeRatePlanIds),
        unitPropertyIds: command.unitPropertyIds,
        pricingModel: setup?.pricingModel ?? "Standard",
        expectedMappingConfigGeneration:
          setupRecord?.mappingConfigGeneration ?? null,
        discovery,
      });

      emitBookingComMappingEvent(this.log, BOOKING_COM_MAPPING_EVENTS.VALIDATION, {
        tenantId: command.tenantId,
        connectionId: command.connectionId,
        ok: result.ok,
        blockingCount: result.blocking.length,
        warningCount: result.warnings.length,
      });

      return Result.ok(result);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
