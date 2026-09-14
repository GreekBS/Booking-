import { Result } from "../../shared/kernel/Result";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../shared/errors/DomainError";
import { User } from "../domain/User";
import { Membership } from "../domain/Membership";
import { Invitation } from "../domain/Invitation";
import type {
  IUserRepository,
  IMembershipRepository,
  IInvitationRepository,
} from "../ports/IdentityRepositories";
import type { PermissionChecker, ActorContext } from "../../shared/services/PermissionChecker";
import type { TenantRole } from "../../shared/types/index";
import type { IIdGenerator } from "../../shared/ports/IIdGenerator";
import type { IInvitationNotifier } from "../ports/NotificationPorts";

export interface InviteMemberCommand {
  tenantId: string;
  email: string;
  role: TenantRole;
  propertyIds?: string[] | null;
  invitedBy: string;
  tokenHash: string;
  rawToken: string;
}

export interface InviteMemberResult {
  invitation: Invitation;
  rawToken: string;
}

export class InviteMemberUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly membershipRepository: IMembershipRepository,
    private readonly invitationRepository: IInvitationRepository,
    private readonly permissionChecker: PermissionChecker,
    private readonly idGenerator: IIdGenerator,
    private readonly invitationNotifier: IInvitationNotifier,
  ) {}

  async execute(
    command: InviteMemberCommand,
    actor: ActorContext,
  ): Promise<Result<InviteMemberResult, Error>> {
    try {
      if (
        !this.permissionChecker.hasPermission(actor, "member:invite:tenant", command.tenantId)
      ) {
        return Result.fail(new ForbiddenError());
      }

      const email = command.email.trim().toLowerCase();
      const existingUser = await this.userRepository.findByEmail(email);

      if (existingUser) {
        const existingMembership = await this.membershipRepository.findByUserAndTenant(
          existingUser.id,
          command.tenantId,
        );
        if (existingMembership?.isActive) {
          return Result.fail(new ConflictError("User is already a member"));
        }
      }

      const pending = await this.invitationRepository.findPendingByEmailAndTenant(
        email,
        command.tenantId,
      );
      if (pending) {
        return Result.fail(new ConflictError("Invitation already pending"));
      }

      const invitation = Invitation.create({
        id: this.idGenerator.generate(),
        tenantId: command.tenantId,
        email,
        role: command.role,
        propertyIds: command.propertyIds,
        tokenHash: command.tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedBy: command.invitedBy,
      });

      await this.invitationRepository.save(invitation);

      await this.invitationNotifier.sendInvitation({
        email,
        tenantId: command.tenantId,
        invitationId: invitation.id,
        rawToken: command.rawToken,
      });

      return Result.ok({ invitation, rawToken: command.rawToken });
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface AcceptInvitationCommand {
  tokenHash: string;
  name: string;
  passwordHash?: string;
  existingUserId?: string;
}

export class AcceptInvitationUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly membershipRepository: IMembershipRepository,
    private readonly invitationRepository: IInvitationRepository,
    private readonly idGenerator: IIdGenerator,
  ) {}

  async execute(command: AcceptInvitationCommand): Promise<Result<Membership, Error>> {
    try {
      const invitation = await this.invitationRepository.findByTokenHash(command.tokenHash);
      if (!invitation) {
        return Result.fail(new NotFoundError("Invitation", "token"));
      }
      if (invitation.isExpired) {
        return Result.fail(new ValidationError("Invitation expired"));
      }
      if (invitation.isAccepted) {
        return Result.fail(new ConflictError("Invitation already accepted"));
      }

      let user: User | null = null;

      if (command.existingUserId) {
        user = await this.userRepository.findById(command.existingUserId);
      } else {
        user = await this.userRepository.findByEmail(invitation.email.value);
      }

      if (!user) {
        if (!command.passwordHash) {
          return Result.fail(new ValidationError("Password required for new users"));
        }
        user = User.create({
          id: this.idGenerator.generate(),
          email: invitation.email.value,
          name: command.name,
          passwordHash: command.passwordHash,
        });
        user.verifyEmail();
        await this.userRepository.save(user);
      }

      invitation.accept();
      await this.invitationRepository.save(invitation);

      const existingMembership = await this.membershipRepository.findByUserAndTenant(
        user.id,
        invitation.tenantId,
      );

      if (existingMembership) {
        existingMembership.activate();
        existingMembership.updateRole(invitation.role, invitation.propertyIds);
        await this.membershipRepository.save(existingMembership);
        return Result.ok(existingMembership);
      }

      const membership = Membership.create({
        id: this.idGenerator.generate(),
        userId: user.id,
        tenantId: invitation.tenantId,
        role: invitation.role,
        propertyIds: invitation.propertyIds,
        status: "active",
      });

      await this.membershipRepository.save(membership);
      return Result.ok(membership);
    } catch (error) {
      return Result.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
