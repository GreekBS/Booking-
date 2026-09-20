import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { ChannelConnectionStatus } from "../../channels/domain/ChannelConnectionStatus";
import type {
  IPlatformOperationsRepository,
  ListPlatformChannelsQuery,
  PlatformChannelConnectionRow,
  PlatformPage,
} from "../ports/IPlatformOperationsRepository";

const CONNECTION_STATUSES: readonly ChannelConnectionStatus[] = [
  "draft",
  "pending_auth",
  "active",
  "paused",
  "error",
  "disconnected",
];

export interface ListPlatformChannelsCommand {
  page?: number;
  limit?: number;
  q?: string;
  tenantId?: string;
  provider?: string;
  status?: ChannelConnectionStatus;
}

export class ListPlatformChannelsUseCase {
  constructor(private readonly operations: IPlatformOperationsRepository) {}

  async execute(
    command: ListPlatformChannelsCommand = {},
  ): Promise<Result<PlatformPage<PlatformChannelConnectionRow>, Error>> {
    try {
      const page = command.page ?? 1;
      const limit = command.limit ?? 50;
      if (page < 1 || limit < 1 || limit > 100) {
        return Result.fail(new ValidationError("Invalid pagination"));
      }
      if (
        command.status != null &&
        !CONNECTION_STATUSES.includes(command.status)
      ) {
        return Result.fail(new ValidationError("Invalid connection status"));
      }
      const query: ListPlatformChannelsQuery = {
        page,
        limit,
        q: command.q?.trim() || undefined,
        tenantId: command.tenantId?.trim() || undefined,
        provider: command.provider?.trim() || undefined,
        status: command.status,
      };
      return Result.ok(await this.operations.listConnections(query));
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
