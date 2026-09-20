import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type {
  IPlatformDirectoryRepository,
  ListPlatformUsersQuery,
  PlatformDirectoryPage,
  PlatformUserRow,
} from "../ports/IPlatformDirectoryRepository";

export interface ListPlatformUsersCommand {
  page?: number;
  limit?: number;
  q?: string;
  tenantId?: string;
  platformRole?: "super_admin" | "none";
}

export class ListPlatformUsersUseCase {
  constructor(private readonly directory: IPlatformDirectoryRepository) {}

  async execute(
    command: ListPlatformUsersCommand = {},
  ): Promise<Result<PlatformDirectoryPage<PlatformUserRow>, Error>> {
    try {
      const page = command.page ?? 1;
      const limit = command.limit ?? 50;
      if (page < 1 || limit < 1 || limit > 100) {
        return Result.fail(new ValidationError("Invalid pagination"));
      }
      if (
        command.platformRole != null &&
        command.platformRole !== "super_admin" &&
        command.platformRole !== "none"
      ) {
        return Result.fail(new ValidationError("Invalid platform role filter"));
      }

      const query: ListPlatformUsersQuery = {
        page,
        limit,
        q: command.q?.trim() || undefined,
        tenantId: command.tenantId?.trim() || undefined,
        platformRole: command.platformRole,
      };

      return Result.ok(await this.directory.listUsers(query));
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
