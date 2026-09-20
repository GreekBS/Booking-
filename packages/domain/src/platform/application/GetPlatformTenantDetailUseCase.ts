import { Result } from "../../shared/kernel/Result";
import { NotFoundError, ValidationError } from "../../shared/errors/DomainError";
import type {
  IPlatformDirectoryRepository,
  PlatformTenantDetail,
} from "../ports/IPlatformDirectoryRepository";

export class GetPlatformTenantDetailUseCase {
  constructor(private readonly directory: IPlatformDirectoryRepository) {}

  async execute(
    tenantId: string,
  ): Promise<Result<PlatformTenantDetail, Error>> {
    try {
      const id = tenantId?.trim();
      if (!id) {
        return Result.fail(new ValidationError("Tenant id is required"));
      }

      const detail = await this.directory.getTenantDetail(id);
      if (!detail) {
        return Result.fail(new NotFoundError("Tenant", id));
      }
      return Result.ok(detail);
    } catch (error) {
      return Result.fail(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }
}
