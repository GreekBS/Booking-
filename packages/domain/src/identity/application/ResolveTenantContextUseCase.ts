import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, UnauthorizedError } from "../../shared/errors/DomainError";
import type { TenantRole } from "../../shared/types/index";
import type { ITenantRepository } from "../../platform/ports/ITenantRepository";
import type {
  IMembershipRepository,
  IUserRepository,
} from "../ports/IdentityRepositories";

export interface ResolvedTenantContext {
  tenantId: string;
  tenantStatus: string;
  role: TenantRole | "super_admin";
  propertyIds: string[] | null;
  isSuperAdmin: boolean;
  /** DB-authoritative platform role — never from JWT. */
  platformRole: "super_admin" | null;
  email: string;
  userId: string;
}

export interface ResolveTenantContextInput {
  userId: string;
  tenantId: string;
  /**
   * JWT platformRole claim for mismatch diagnostics only.
   * Never used as authorization authority.
   */
  jwtPlatformRole?: "super_admin" | null;
}

/**
 * Resolves tenant access with DB-authoritative User + Tenant reads in parallel
 * (both IDs are known up front). Membership is loaded only for non–super-admins.
 */
export class ResolveTenantContextUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tenantRepository: ITenantRepository,
    private readonly membershipRepository: IMembershipRepository,
  ) {}

  async execute(
    input: ResolveTenantContextInput,
  ): Promise<Result<ResolvedTenantContext, Error>> {
    try {
      const [user, tenant] = await Promise.all([
        this.userRepository.findById(input.userId),
        this.tenantRepository.findById(input.tenantId),
      ]);

      if (!user) {
        return Result.fail(new UnauthorizedError());
      }

      if (!tenant) {
        return Result.fail(new ForbiddenError("Tenant not found"));
      }

      if (tenant.status === "suspended") {
        return Result.fail(new ForbiddenError("Tenant suspended"));
      }

      const platformRole = user.platformRole;
      const jwtRole = input.jwtPlatformRole ?? null;
      if (jwtRole === "super_admin" && platformRole !== "super_admin") {
        console.warn(
          "[auth] platformRole mismatch: JWT claimed super_admin, DB role is null",
          { userId: input.userId },
        );
      }

      const email = user.toProps().email;

      if (platformRole === "super_admin") {
        return Result.ok({
          tenantId: input.tenantId,
          tenantStatus: tenant.status,
          role: "super_admin",
          propertyIds: null,
          isSuperAdmin: true,
          platformRole,
          email,
          userId: input.userId,
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
        platformRole,
        email,
        userId: input.userId,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
