import { Result } from "../../shared/kernel/Result";
import { ForbiddenError } from "../../shared/errors/DomainError";
import type { TenantRole } from "../../shared/types/index";
import type { ITenantRepository } from "../../platform/ports/ITenantRepository";
import type { IMembershipRepository } from "../ports/IdentityRepositories";

export interface ResolvedTenantContext {
  tenantId: string;
  tenantStatus: string;
  role: TenantRole | "super_admin";
  propertyIds: string[] | null;
  isSuperAdmin: boolean;
}

export interface ResolveTenantContextInput {
  userId: string;
  platformRole: "super_admin" | null;
  tenantId: string;
}

export class ResolveTenantContextUseCase {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly membershipRepository: IMembershipRepository,
  ) {}

  async execute(
    input: ResolveTenantContextInput,
  ): Promise<Result<ResolvedTenantContext, Error>> {
    try {
      const tenant = await this.tenantRepository.findById(input.tenantId);
      if (!tenant) {
        return Result.fail(new ForbiddenError("Tenant not found"));
      }

      if (tenant.status === "suspended") {
        return Result.fail(new ForbiddenError("Tenant suspended"));
      }

      if (input.platformRole === "super_admin") {
        return Result.ok({
          tenantId: input.tenantId,
          tenantStatus: tenant.status,
          role: "super_admin",
          propertyIds: null,
          isSuperAdmin: true,
        });
      }

      const membership = await this.membershipRepository.findByUserAndTenant(
        input.userId,
        input.tenantId,
      );

      if (!membership || membership.status !== "active") {
        return Result.fail(new ForbiddenError("Not a member of this tenant"));
      }

      return Result.ok({
        tenantId: input.tenantId,
        tenantStatus: tenant.status,
        role: membership.role,
        propertyIds: membership.propertyIds,
        isSuperAdmin: false,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
