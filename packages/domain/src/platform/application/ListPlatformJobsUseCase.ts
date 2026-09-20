import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { BackgroundJobStatus } from "../../shared/types/index";
import type {
  IPlatformOperationsRepository,
  ListPlatformJobsQuery,
  PlatformBackgroundJobRow,
  PlatformPage,
} from "../ports/IPlatformOperationsRepository";

const JOB_STATUSES: readonly BackgroundJobStatus[] = [
  "pending",
  "processing",
  "completed",
  "dead_letter",
  "cancelled",
];

export interface ListPlatformJobsCommand {
  page?: number;
  limit?: number;
  status?: BackgroundJobStatus;
  jobType?: string;
  tenantId?: string;
}

export class ListPlatformJobsUseCase {
  constructor(private readonly operations: IPlatformOperationsRepository) {}

  async execute(
    command: ListPlatformJobsCommand = {},
  ): Promise<Result<PlatformPage<PlatformBackgroundJobRow>, Error>> {
    try {
      const page = command.page ?? 1;
      const limit = command.limit ?? 50;
      if (page < 1 || limit < 1 || limit > 100) {
        return Result.fail(new ValidationError("Invalid pagination"));
      }
      if (command.status != null && !JOB_STATUSES.includes(command.status)) {
        return Result.fail(new ValidationError("Invalid job status"));
      }
      const query: ListPlatformJobsQuery = {
        page,
        limit,
        status: command.status,
        jobType: command.jobType?.trim() || undefined,
        tenantId: command.tenantId?.trim() || undefined,
      };
      return Result.ok(await this.operations.listJobs(query));
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
