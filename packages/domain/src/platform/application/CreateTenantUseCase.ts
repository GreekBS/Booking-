import { Result } from "../../shared/kernel/Result";
import { TenantSlug } from "../../shared/value-objects/Slug";
import { TenantSettings } from "../../shared/value-objects/Policies";
import { Email } from "../../shared/value-objects/Email";
import { ConflictError, ValidationError } from "../../shared/errors/DomainError";
import { Tenant } from "../domain/Tenant";
import { Membership } from "../../identity/domain/Membership";
import { Invitation } from "../../identity/domain/Invitation";
import type { ITenantRepository } from "../ports/ITenantRepository";
import type {
  IMembershipRepository,
  IInvitationRepository,
  IUserRepository,
} from "../../identity/ports/IdentityRepositories";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { UseCaseAuditContext } from "../../shared/types/AuditContext";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";

export interface CreateTenantCommand {
  name: string;
  slug?: string;
  timezone?: string;
  defaultLocale?: string;
  defaultCurrency?: string;
  adminEmail?: string;
  adminName?: string;
  invitedByUserId?: string;
}

export type TenantProvisioningResult =
  | { type: "membership"; membershipId: string }
  | { type: "invitation"; invitationId: string };

export interface CreateTenantResult {
  tenant: Tenant;
  provisioning: TenantProvisioningResult | null;
}

export class CreateTenantUseCase {
  constructor(
    private readonly tenantRepository: ITenantRepository,
    private readonly userRepository: IUserRepository,
    private readonly membershipRepository: IMembershipRepository,
    private readonly invitationRepository: IInvitationRepository,
    private readonly auditLogRepository: IAuditLogRepository,
    private readonly idGenerator: IIdGenerator,
    private readonly generateInviteToken: () => { token: string; tokenHash: string },
  ) {}

  async execute(
    command: CreateTenantCommand,
    audit: UseCaseAuditContext,
  ): Promise<Result<CreateTenantResult, Error>> {
    try {
      const name = command.name.trim();
      if (name.length < 2) {
        return Result.fail(new ValidationError("Tenant name is required"));
      }

      const slug = command.slug
        ? TenantSlug.create(command.slug)
        : TenantSlug.fromName(name);

      const exists = await this.tenantRepository.existsBySlug(slug.value);
      if (exists) {
        return Result.fail(
          new ConflictError(`Tenant slug already exists: ${slug.value}`),
        );
      }

      const tenant = Tenant.create({
        id: this.idGenerator.generate(),
        name,
        slug: slug.value,
        settings: TenantSettings.create({
          timezone: command.timezone,
          defaultLocale: command.defaultLocale,
          defaultCurrency: command.defaultCurrency,
        }),
      });

      await this.tenantRepository.save(tenant);

      let provisioning: TenantProvisioningResult | null = null;

      if (command.adminEmail) {
        const email = Email.create(command.adminEmail).value;
        const existingUser = await this.userRepository.findByEmail(email);

        if (existingUser) {
          const membership = Membership.create({
            id: this.idGenerator.generate(),
            userId: existingUser.id,
            tenantId: tenant.id,
            role: "admin",
            propertyIds: null,
          });
          await this.membershipRepository.save(membership);
          provisioning = { type: "membership", membershipId: membership.id };
        } else if (command.invitedByUserId) {
          const { tokenHash } = this.generateInviteToken();
          const invitation = Invitation.create({
            id: this.idGenerator.generate(),
            tenantId: tenant.id,
            email,
            role: "admin",
            propertyIds: null,
            tokenHash,
            invitedBy: command.invitedByUserId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          });
          await this.invitationRepository.save(invitation);
          provisioning = { type: "invitation", invitationId: invitation.id };
        }
      }

      await this.auditLogRepository.append({
        tenantId: tenant.id,
        actorId: audit.actorId,
        action: "tenant.create",
        resourceType: "Tenant",
        resourceId: tenant.id,
        metadata: { name: tenant.name, provisioning },
        ipAddress: audit.ipAddress,
      });

      return Result.ok({ tenant, provisioning });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
