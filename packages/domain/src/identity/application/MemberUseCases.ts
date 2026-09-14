import { Result } from "../../shared/kernel/Result";
import { ForbiddenError, ValidationError } from "../../shared/errors/DomainError";
import type { Membership } from "../domain/Membership";
import type {
  IMembershipRepository,
  IUserRepository,
} from "../ports/IdentityRepositories";
import type { TenantRole } from "../../shared/types/index";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";

export interface MemberListItem {
  id: string;
  userId: string;
  role: string;
  status: string;
  propertyIds: string[] | null;
  user: { id: string; email: string; name: string } | null;
}

export class ListMembersUseCase {
  constructor(
    private readonly membershipRepository: IMembershipRepository,
    private readonly userRepository: IUserRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
  ): Promise<Result<MemberListItem[], Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(actor, "member:read:tenant", tenantId)
      ) {
        return Result.fail(new ForbiddenError());
      }

      const members = await this.membershipRepository.findByTenant(tenantId);
      const enriched = await Promise.all(
        members.map(async (membership) => {
          const user = await this.userRepository.findById(membership.userId);
          const props = membership.toProps();
          return {
            id: props.id,
            userId: props.userId,
            role: props.role,
            status: props.status,
            propertyIds: props.propertyIds,
            user: user
              ? {
                  id: user.id,
                  email: user.toProps().email,
                  name: user.name,
                }
              : null,
          };
        }),
      );

      return Result.ok(enriched);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface UpdateMemberCommand {
  tenantId: string;
  membershipId: string;
  role?: TenantRole;
  propertyIds?: string[] | null;
}

export class UpdateMemberUseCase {
  constructor(
    private readonly membershipRepository: IMembershipRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLogRepository: IAuditLogRepository,
  ) {}

  async execute(
    command: UpdateMemberCommand,
    actor: ActorContext,
    auditContext?: { ipAddress: string | null },
  ): Promise<Result<Membership, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          "member:update:tenant",
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const membership = await this.membershipRepository.findById(command.membershipId);
      if (!membership || membership.tenantId !== command.tenantId) {
        return Result.fail(new ValidationError("Membership not found"));
      }

      const previousRole = membership.role;
      if (command.role !== undefined || command.propertyIds !== undefined) {
        membership.updateRole(
          command.role ?? membership.role,
          command.propertyIds !== undefined
            ? command.propertyIds
            : membership.propertyIds,
        );
      }

      await this.membershipRepository.save(membership);

      await this.auditLogRepository.append({
        tenantId: command.tenantId,
        actorId: actor.userId,
        action: "member.role_updated",
        resourceType: "Membership",
        resourceId: membership.id,
        metadata: {
          userId: membership.userId,
          previousRole,
          newRole: membership.role,
          propertyIds: membership.propertyIds,
        },
        ipAddress: auditContext?.ipAddress ?? null,
      });

      return Result.ok(membership);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface RevokeMemberCommand {
  tenantId: string;
  membershipId: string;
}

export class RevokeMemberUseCase {
  constructor(
    private readonly membershipRepository: IMembershipRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly auditLogRepository: IAuditLogRepository,
  ) {}

  async execute(
    command: RevokeMemberCommand,
    actor: ActorContext,
    auditContext?: { ipAddress: string | null },
  ): Promise<Result<Membership, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(
          actor,
          "member:revoke:tenant",
          command.tenantId,
        )
      ) {
        return Result.fail(new ForbiddenError());
      }

      const membership = await this.membershipRepository.findById(command.membershipId);
      if (!membership || membership.tenantId !== command.tenantId) {
        return Result.fail(new ValidationError("Membership not found"));
      }

      if (membership.userId === actor.userId) {
        return Result.fail(new ValidationError("Cannot revoke your own membership"));
      }

      membership.revoke();
      await this.membershipRepository.save(membership);

      await this.auditLogRepository.append({
        tenantId: command.tenantId,
        actorId: actor.userId,
        action: "member.revoked",
        resourceType: "Membership",
        resourceId: membership.id,
        metadata: { userId: membership.userId },
        ipAddress: auditContext?.ipAddress ?? null,
      });

      return Result.ok(membership);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
