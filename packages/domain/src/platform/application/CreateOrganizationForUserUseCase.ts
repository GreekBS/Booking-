import { Result } from "../../shared/kernel/Result";
import { ConflictError, ValidationError } from "../../shared/errors/DomainError";
import { TenantSlug } from "../../shared/value-objects/Slug";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type {
  IMembershipRepository,
  IUserRepository,
} from "../../identity/ports/IdentityRepositories";
import { Membership } from "../../identity/domain/Membership";
import type { ICommerceSettingsRepository } from "../../commerce/ports/CommercePorts";
import type { ITenantRepository } from "../ports/ITenantRepository";
import {
  CreateTenantUseCase,
  type CreateTenantResult,
} from "./CreateTenantUseCase";

export interface CreateOrganizationForUserCommand {
  userId: string;
  name: string;
  slug?: string;
  timezone?: string;
  defaultLocale?: string;
  defaultCurrency?: string;
}

export interface CreateOrganizationForUserResult {
  tenant: CreateTenantResult["tenant"];
  provisioning: CreateTenantResult["provisioning"];
  /** True when the caller already had an active membership — no new tenant created. */
  reusedExisting: boolean;
}

/**
 * Self-serve organization bootstrap for a normal customer.
 * Idempotent: if the user already has an active membership, returns that tenant.
 * Does not grant platform roles.
 */
export class CreateOrganizationForUserUseCase {
  constructor(
    private readonly createTenantUseCase: CreateTenantUseCase,
    private readonly userRepository: IUserRepository,
    private readonly membershipRepository: IMembershipRepository,
    private readonly tenantRepository: ITenantRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly commerceSettingsRepository?: ICommerceSettingsRepository,
  ) {}

  async execute(
    command: CreateOrganizationForUserCommand,
    audit: UseCaseAuditContext,
  ): Promise<Result<CreateOrganizationForUserResult, Error>> {
    try {
      const user = await this.userRepository.findById(command.userId);
      if (!user) {
        return Result.fail(new ValidationError("User not found"));
      }

      const memberships = await this.membershipRepository.findByUser(command.userId);
      const active = memberships.find((m) => m.toProps().status === "active");
      if (active) {
        const tenant = await this.tenantRepository.findById(active.tenantId);
        if (!tenant) {
          return Result.fail(new ValidationError("Existing membership tenant not found"));
        }
        return Result.ok({
          tenant,
          provisioning: { type: "membership", membershipId: active.id },
          reusedExisting: true,
        });
      }

      const email = user.toProps().email;
      const created = await this.createTenantUseCase.execute(
        {
          name: command.name,
          slug: command.slug,
          timezone: command.timezone,
          defaultLocale: command.defaultLocale,
          defaultCurrency: command.defaultCurrency,
          adminEmail: email,
          adminName: user.toProps().name,
          invitedByUserId: command.userId,
        },
        audit,
      );

      if (created.isSuccess) {
        const value = created.getValue();
        return Result.ok({
          tenant: value.tenant,
          provisioning: value.provisioning,
          reusedExisting: false,
        });
      }

      // Recover empty tenants left by a prior create that failed after tenant insert
      // (e.g. membership RLS) — claim only when the slug tenant has zero memberships.
      const err = created.getError();
      if (err instanceof ConflictError) {
        const slug = command.slug
          ? TenantSlug.create(command.slug)
          : TenantSlug.fromName(command.name.trim());
        const orphan = await this.tenantRepository.findBySlug(slug.value);
        if (orphan) {
          const members = await this.membershipRepository.findByTenant(orphan.id);
          if (members.length === 0) {
            const membership = Membership.create({
              id: this.idGenerator.generate(),
              userId: command.userId,
              tenantId: orphan.id,
              role: "admin",
              propertyIds: null,
            });
            await this.membershipRepository.save(membership);
            if (this.commerceSettingsRepository) {
              await this.commerceSettingsRepository.ensureDefaults(orphan.id);
            }
            return Result.ok({
              tenant: orphan,
              provisioning: { type: "membership", membershipId: membership.id },
              reusedExisting: true,
            });
          }
        }
      }

      return Result.fail(err);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
