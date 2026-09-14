import { Result } from "../../shared/kernel/Result";
import type { IUserRepository } from "../ports/IdentityRepositories";
import type { IMembershipRepository } from "../ports/IdentityRepositories";
import type { ITenantRepository } from "../../platform/ports/ITenantRepository";

export interface MeProfile {
  user: {
    id: string;
    email: string;
    name: string;
    platformRole: string | null;
    emailVerified: string | null;
  };
  memberships: Array<{
    id: string;
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    role: string;
    propertyIds: string[] | null;
    status: string;
  }>;
  activeTenantId: string | null;
}

export class GetMeUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly membershipRepository: IMembershipRepository,
    private readonly tenantRepository: ITenantRepository,
  ) {}

  async execute(
    userId: string,
    activeTenantId: string | null,
  ): Promise<Result<MeProfile, Error>> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        return Result.fail(new Error("User not found"));
      }

      const props = user.toProps();
      const memberships = await this.membershipRepository.findByUser(userId);

      const enriched = await Promise.all(
        memberships.map(async (membership) => {
          const tenant = await this.tenantRepository.findById(membership.tenantId);
          const mProps = membership.toProps();
          return {
            id: mProps.id,
            tenantId: mProps.tenantId,
            tenantName: tenant?.name ?? "Unknown",
            tenantSlug: tenant?.slug.value ?? "",
            role: mProps.role,
            propertyIds: mProps.propertyIds,
            status: mProps.status,
          };
        }),
      );

      return Result.ok({
        user: {
          id: props.id,
          email: props.email,
          name: props.name,
          platformRole: props.platformRole,
          emailVerified: props.emailVerified?.toISOString() ?? null,
        },
        memberships: enriched,
        activeTenantId,
      });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
