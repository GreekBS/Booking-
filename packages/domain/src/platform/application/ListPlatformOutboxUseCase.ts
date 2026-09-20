import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { OutboxEventStatus } from "../../shared/types/index";
import type {
  IPlatformOperationsRepository,
  ListPlatformOutboxQuery,
  PlatformOutboxRow,
  PlatformPage,
} from "../ports/IPlatformOperationsRepository";

const OUTBOX_STATUSES: readonly OutboxEventStatus[] = [
  "pending",
  "processing",
  "completed",
  "dead_letter",
];

export interface ListPlatformOutboxCommand {
  page?: number;
  limit?: number;
  status?: OutboxEventStatus;
  eventType?: string;
  tenantId?: string;
}

export class ListPlatformOutboxUseCase {
  constructor(private readonly operations: IPlatformOperationsRepository) {}

  async execute(
    command: ListPlatformOutboxCommand = {},
  ): Promise<Result<PlatformPage<PlatformOutboxRow>, Error>> {
    try {
      const page = command.page ?? 1;
      const limit = command.limit ?? 50;
      if (page < 1 || limit < 1 || limit > 100) {
        return Result.fail(new ValidationError("Invalid pagination"));
      }
      if (
        command.status != null &&
        !OUTBOX_STATUSES.includes(command.status)
      ) {
        return Result.fail(new ValidationError("Invalid outbox status"));
      }
      const query: ListPlatformOutboxQuery = {
        page,
        limit,
        status: command.status,
        eventType: command.eventType?.trim() || undefined,
        tenantId: command.tenantId?.trim() || undefined,
      };
      return Result.ok(await this.operations.listOutbox(query));
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
