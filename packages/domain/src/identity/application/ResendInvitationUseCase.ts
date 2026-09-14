import { Result } from "../../shared/kernel/Result";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import type { IInvitationRepository } from "../ports/IdentityRepositories";
import type { IInvitationNotifier } from "../ports/NotificationPorts";

export interface ResendInvitationCommand {
  tenantId: string;
  invitationId: string;
  tokenHash: string;
  rawToken: string;
}

export class ResendInvitationUseCase {
  constructor(
    private readonly invitationRepository: IInvitationRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly invitationNotifier: IInvitationNotifier,
    private readonly auditLogRepository: IAuditLogRepository,
  ) {}

  async execute(
    command: ResendInvitationCommand,
    actor: ActorContext,
    auditContext?: { ipAddress: string | null },
  ): Promise<Result<{ invitationId: string; expiresAt: Date }, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(actor, "member:invite:tenant", command.tenantId)
      ) {
        return Result.fail(new ForbiddenError());
      }

      const invitation = await this.invitationRepository.findById(
        command.invitationId,
        command.tenantId,
      );
      if (!invitation) {
        return Result.fail(new NotFoundError("Invitation", command.invitationId));
      }
      if (invitation.isAccepted) {
        return Result.fail(new ValidationError("Invitation already accepted"));
      }

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      invitation.refreshToken(command.tokenHash, expiresAt);
      await this.invitationRepository.save(invitation);

      await this.invitationNotifier.sendInvitation({
        email: invitation.email.value,
        tenantId: command.tenantId,
        invitationId: invitation.id,
        rawToken: command.rawToken,
      });

      await this.auditLogRepository.append({
        tenantId: command.tenantId,
        actorId: actor.userId,
        action: "member.invitation_resent",
        resourceType: "Invitation",
        resourceId: invitation.id,
        metadata: { email: invitation.email.value },
        ipAddress: auditContext?.ipAddress ?? null,
      });

      return Result.ok({ invitationId: invitation.id, expiresAt });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface PendingInvitationItem {
  id: string;
  email: string;
  role: string;
  propertyIds: string[] | null;
  expiresAt: Date;
  invitedBy: string;
}

export class ListPendingInvitationsUseCase {
  constructor(
    private readonly invitationRepository: IInvitationRepository,
    private readonly permissionChecker: PermissionChecker,
  ) {}

  async execute(
    tenantId: string,
    actor: ActorContext,
  ): Promise<Result<PendingInvitationItem[], Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(actor, "member:read:tenant", tenantId)
      ) {
        return Result.fail(new ForbiddenError());
      }

      const invitations = await this.invitationRepository.findPendingByTenant(tenantId);
      return Result.ok(
        invitations.map((invitation) => {
          const props = invitation.toProps();
          return {
            id: props.id,
            email: props.email,
            role: props.role,
            propertyIds: props.propertyIds,
            expiresAt: props.expiresAt,
            invitedBy: props.invitedBy,
          };
        }),
      );
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
