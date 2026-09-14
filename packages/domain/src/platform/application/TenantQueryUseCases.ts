import { Result } from "../../shared/kernel/Result";
import { ValidationError } from "../../shared/errors/DomainError";
import type { Tenant } from "../domain/Tenant";
import type { ITenantRepository } from "../ports/ITenantRepository";
import type { PaginatedResult, PaginationParams } from "../../shared/types/index";

export interface TenantListItem {
  tenant: Tenant;
  propertyCount: number;
}

export class ListTenantsUseCase {
  constructor(private readonly tenantRepository: ITenantRepository) {}

  async execute(
    params: PaginationParams,
  ): Promise<Result<PaginatedResult<TenantListItem>, Error>> {
    try {
      const result = await this.tenantRepository.findAll(params);
      const data = await Promise.all(
        result.data.map(async (tenant) => ({
          tenant,
          propertyCount: await this.tenantRepository.countProperties(tenant.id),
        })),
      );

      return Result.ok({
        data,
        total: result.total,
        page: result.page,
        limit: result.limit,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export class GetTenantUseCase {
  constructor(private readonly tenantRepository: ITenantRepository) {}

  async execute(tenantId: string): Promise<Result<TenantListItem, Error>> {
    try {
      const tenant = await this.tenantRepository.findById(tenantId);
      if (!tenant) {
        return Result.fail(new ValidationError("Tenant not found"));
      }

      const propertyCount = await this.tenantRepository.countProperties(tenantId);
      return Result.ok({ tenant, propertyCount });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
