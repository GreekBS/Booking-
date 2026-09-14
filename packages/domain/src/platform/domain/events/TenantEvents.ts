import { BaseDomainEvent } from "../../../shared/kernel/DomainEvent";

export class TenantCreatedEvent extends BaseDomainEvent {
  constructor(
    tenantId: string,
    payload: { name: string; slug: string },
  ) {
    super("TenantCreated", "Tenant", tenantId, tenantId, payload);
  }
}

export class TenantSuspendedEvent extends BaseDomainEvent {
  constructor(tenantId: string, payload: { reason?: string }) {
    super("TenantSuspended", "Tenant", tenantId, tenantId, payload);
  }
}

export class TenantActivatedEvent extends BaseDomainEvent {
  constructor(tenantId: string) {
    super("TenantActivated", "Tenant", tenantId, tenantId, {});
  }
}

export class TenantSettingsUpdatedEvent extends BaseDomainEvent {
  constructor(
    tenantId: string,
    payload: { changedFields: string[] },
  ) {
    super("TenantSettingsUpdated", "Tenant", tenantId, tenantId, payload);
  }
}
