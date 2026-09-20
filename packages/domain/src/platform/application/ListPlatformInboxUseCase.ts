import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { ChannelInboxProcessingStatus } from "../../channels/domain/ChannelInboxProcessingStatus";
import type {
  IPlatformOperationsRepository,
  ListPlatformInboxQuery,
  PlatformChannelInboxRow,
  PlatformPage,
} from "../ports/IPlatformOperationsRepository";

const INBOX_STATUSES: readonly ChannelInboxProcessingStatus[] = [
  "received",
  "processing",
  "completed",
  "duplicate",
  "skipped",
  "failed",
  "dead_letter",
];

export interface ListPlatformInboxCommand {
  page?: number;
  limit?: number;
  status?: ChannelInboxProcessingStatus;
  provider?: string;
  tenantId?: string;
  connectionId?: string;
}

export class ListPlatformInboxUseCase {
  constructor(private readonly operations: IPlatformOperationsRepository) {}

  async execute(
    command: ListPlatformInboxCommand = {},
  ): Promise<Result<PlatformPage<PlatformChannelInboxRow>, Error>> {
    try {
      const page = command.page ?? 1;
      const limit = command.limit ?? 50;
      if (page < 1 || limit < 1 || limit > 100) {
        return Result.fail(new ValidationError("Invalid pagination"));
      }
      if (
        command.status != null &&
        !INBOX_STATUSES.includes(command.status)
      ) {
        return Result.fail(new ValidationError("Invalid inbox status"));
      }
      const query: ListPlatformInboxQuery = {
        page,
        limit,
        status: command.status,
        provider: command.provider?.trim() || undefined,
        tenantId: command.tenantId?.trim() || undefined,
        connectionId: command.connectionId?.trim() || undefined,
      };
      return Result.ok(await this.operations.listInbox(query));
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
