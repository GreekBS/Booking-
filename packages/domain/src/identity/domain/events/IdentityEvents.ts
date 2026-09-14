import { BaseDomainEvent } from "../../../shared/kernel/DomainEvent";

export class MemberInvitedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    tenantId: string,
    payload: { email: string; role: string },
  ) {
    super("MemberInvited", "Invitation", aggregateId, tenantId, payload);
  }
}

export class MemberJoinedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    tenantId: string,
    payload: { userId: string; role: string },
  ) {
    super("MemberJoined", "Membership", aggregateId, tenantId, payload);
  }
}

export class MemberRevokedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    tenantId: string,
    payload: { userId: string },
  ) {
    super("MemberRevoked", "Membership", aggregateId, tenantId, payload);
  }
}

export class MemberRoleUpdatedEvent extends BaseDomainEvent {
  constructor(
    aggregateId: string,
    tenantId: string,
    payload: { userId: string; previousRole: string; newRole: string },
  ) {
    super("MemberRoleUpdated", "Membership", aggregateId, tenantId, payload);
  }
}
