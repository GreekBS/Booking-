import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { IChannelConnectionRepository } from "../ports/IChannelConnectionRepository";
import type {
  ChannelConnectionProviderSetupRecord,
  IChannelConnectionProviderSetupRepository,
  IChannelProductMappingRepository,
} from "../ports/IChannelProductMappingRepository";
import type { ChannelProductMapping } from "../domain/ChannelProductMapping";
import { parseBookingComConnectionSetup } from "../providers/booking_com/setup/BookingComConnectionSetup";

export interface ListChannelProductMappingsCommand {
  tenantId: string;
  connectionId: string;
}

export interface ListChannelProductMappingsResult {
  mappings: readonly ChannelProductMapping[];
  setup: ChannelConnectionProviderSetupRecord | null;
  mappingConfigGeneration: number;
}

export class ListChannelProductMappingsUseCase {
  constructor(
    private readonly connections: IChannelConnectionRepository,
    private readonly setups: IChannelConnectionProviderSetupRepository,
    private readonly mappings: IChannelProductMappingRepository,
  ) {}

  async execute(
    command: ListChannelProductMappingsCommand,
  ): Promise<Result<ListChannelProductMappingsResult, Error>> {
    try {
      const connection = await this.connections.findById(
        command.tenantId,
        command.connectionId,
      );
      if (!connection) {
        return Result.fail(new ValidationError("Connection not found"));
      }

      const setup = await this.setups.get(command.tenantId, command.connectionId);
      if (setup) {
        // Validate shape early so UI consumers get consistent errors.
        parseBookingComConnectionSetup(setup.setup);
      }

      const mappings = await this.mappings.listByConnection(
        command.tenantId,
        command.connectionId,
      );

      return Result.ok({
        mappings,
        setup,
        mappingConfigGeneration: setup?.mappingConfigGeneration ?? 0,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
