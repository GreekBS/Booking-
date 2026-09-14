import { AggregateRoot } from "../../shared/kernel/Entity";
import { Email } from "../../shared/value-objects/Email";
import type { TenantRole } from "../../shared/types/index";
import { MemberInvitedEvent } from "./events/IdentityEvents";

export interface InvitationProps {
  id: string;
  tenantId: string;
  email: string;
  role: TenantRole;
  propertyIds: string[] | null;
  tokenHash: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  invitedBy: string;
  createdAt: Date;
}

export interface CreateInvitationProps {
  id: string;
  tenantId: string;
  email: string;
  role: TenantRole;
  propertyIds?: string[] | null;
  tokenHash: string;
  expiresAt: Date;
  invitedBy: string;
}

export class Invitation extends AggregateRoot<InvitationProps> {
  private constructor(props: InvitationProps) {
    super(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get email(): Email {
    return Email.create(this.props.email);
  }

  get role(): TenantRole {
    return this.props.role;
  }

  get propertyIds(): string[] | null {
    return this.props.propertyIds;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get acceptedAt(): Date | null {
    return this.props.acceptedAt;
  }

  get isExpired(): boolean {
    return new Date() > this.props.expiresAt;
  }

  get isAccepted(): boolean {
    return this.props.acceptedAt !== null;
  }

  static create(props: CreateInvitationProps): Invitation {
    Email.create(props.email);
    const invitation = new Invitation({
      ...props,
      email: props.email.trim().toLowerCase(),
      propertyIds: props.propertyIds ?? null,
      acceptedAt: null,
      createdAt: new Date(),
    });

    invitation.addDomainEvent(
      new MemberInvitedEvent(invitation.id, props.tenantId, {
        email: invitation.props.email,
        role: props.role,
      }),
    );

    return invitation;
  }

  static reconstitute(props: InvitationProps): Invitation {
    return new Invitation(props);
  }

  accept(): void {
    if (this.isAccepted) {
      throw new Error("Invitation already accepted");
    }
    if (this.isExpired) {
      throw new Error("Invitation expired");
    }
    this.props.acceptedAt = new Date();
  }

  refreshToken(tokenHash: string, expiresAt: Date): void {
    if (this.isAccepted) {
      throw new Error("Invitation already accepted");
    }
    this.props.tokenHash = tokenHash;
    this.props.expiresAt = expiresAt;
  }

  toProps(): InvitationProps {
    return { ...this.props };
  }
}
