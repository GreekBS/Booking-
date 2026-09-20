import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { PropertyStatus } from "../../shared/types/index";
import type {
  IPlatformDirectoryRepository,
  ListPlatformPropertiesQuery,
  PlatformDirectoryPage,
  PlatformPropertyRow,
} from "../ports/IPlatformDirectoryRepository";

const PROPERTY_STATUSES: readonly PropertyStatus[] = [
  "draft",
  "active",
  "inactive",
  "archived",
];

export interface ListPlatformPropertiesCommand {
  page?: number;
  limit?: number;
  q?: string;
  tenantId?: string;
  city?: string;
  status?: PropertyStatus;
}

export class ListPlatformPropertiesUseCase {
  constructor(private readonly directory: IPlatformDirectoryRepository) {}

  async execute(
    command: ListPlatformPropertiesCommand = {},
  ): Promise<Result<PlatformDirectoryPage<PlatformPropertyRow>, Error>> {
    try {
      const page = command.page ?? 1;
      const limit = command.limit ?? 50;
      if (page < 1 || limit < 1 || limit > 100) {
        return Result.fail(new ValidationError("Invalid pagination"));
      }
      if (
        command.status != null &&
        !PROPERTY_STATUSES.includes(command.status)
      ) {
        return Result.fail(new ValidationError("Invalid property status filter"));
      }

      const query: ListPlatformPropertiesQuery = {
        page,
        limit,
        q: command.q?.trim() || undefined,
        tenantId: command.tenantId?.trim() || undefined,
        city: command.city?.trim() || undefined,
        status: command.status,
      };

      return Result.ok(await this.directory.listProperties(query));
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
