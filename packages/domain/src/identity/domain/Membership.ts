import { AggregateRoot } from "../../shared/kernel/Entity";
import type { MembershipStatus, TenantRole } from "../../shared/types/index";
import {
  MemberJoinedEvent,
  MemberRevokedEvent,
  MemberRoleUpdatedEvent,
} from "./events/IdentityEvents";

export interface MembershipProps {
  id: string;
  userId: string;
  tenantId: string;
  role: TenantRole;
  propertyIds: string[] | null;
  status: MembershipStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMembershipProps {
  id: string;
  userId: string;
  tenantId: string;
  role: TenantRole;
  propertyIds?: string[] | null;
  status?: MembershipStatus;
}

export class Membership extends AggregateRoot<MembershipProps> {
  private constructor(props: MembershipProps) {
    super(props);
  }

  get userId(): string {
    return this.props.userId;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get role(): TenantRole {
    return this.props.role;
  }

  get propertyIds(): string[] | null {
    return this.props.propertyIds;
  }

  get status(): MembershipStatus {
    return this.props.status;
  }

  get isActive(): boolean {
    return this.props.status === "active";
  }

  static create(props: CreateMembershipProps): Membership {
    const now = new Date();
    const membership = new Membership({
      id: props.id,
      userId: props.userId,
      tenantId: props.tenantId,
      role: props.role,
      propertyIds: props.propertyIds ?? null,
      status: props.status ?? "active",
      createdAt: now,
      updatedAt: now,
    });

    if (membership.status === "active") {
      membership.addDomainEvent(
        new MemberJoinedEvent(membership.id, props.tenantId, {
          userId: props.userId,
          role: props.role,
        }),
      );
    }

    return membership;
  }

  static reconstitute(props: MembershipProps): Membership {
    return new Membership(props);
  }

  activate(): void {
    this.props.status = "active";
    this.props.updatedAt = new Date();
    this.addDomainEvent(
      new MemberJoinedEvent(this.id, this.props.tenantId, {
        userId: this.props.userId,
        role: this.props.role,
      }),
    );
  }

  revoke(): void {
    this.props.status = "revoked";
    this.props.updatedAt = new Date();
    this.addDomainEvent(
      new MemberRevokedEvent(this.id, this.props.tenantId, {
        userId: this.props.userId,
      }),
    );
  }

  updateRole(role: TenantRole, propertyIds: string[] | null): void {
    const previousRole = this.props.role;
    this.props.role = role;
    this.props.propertyIds = propertyIds;
    this.props.updatedAt = new Date();

    if (previousRole !== role) {
      this.addDomainEvent(
        new MemberRoleUpdatedEvent(this.id, this.props.tenantId, {
          userId: this.props.userId,
          previousRole,
          newRole: role,
        }),
      );
    }
  }

  hasPropertyAccess(propertyId: string): boolean {
    if (this.props.propertyIds === null) {
      return true;
    }
    return this.props.propertyIds.includes(propertyId);
  }

  toProps(): MembershipProps {
    return { ...this.props };
  }
}
