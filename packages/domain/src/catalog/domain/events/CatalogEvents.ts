import { BaseDomainEvent } from "../../../shared/kernel/DomainEvent";

export class PropertyCreatedEvent extends BaseDomainEvent {
  constructor(
    propertyId: string,
    tenantId: string,
    payload: { slug: string; name: string; defaultUnitId?: string },
  ) {
    super("PropertyCreated", "Property", propertyId, tenantId, payload);
  }
}

export class PropertyUpdatedEvent extends BaseDomainEvent {
  constructor(
    propertyId: string,
    tenantId: string,
    payload: { changedFields: string[] },
  ) {
    super("PropertyUpdated", "Property", propertyId, tenantId, payload);
  }
}

export class PropertyArchivedEvent extends BaseDomainEvent {
  constructor(propertyId: string, tenantId: string) {
    super("PropertyArchived", "Property", propertyId, tenantId, {});
  }
}

export class UnitAddedEvent extends BaseDomainEvent {
  constructor(
    unitId: string,
    tenantId: string,
    payload: { propertyId: string; name: string },
  ) {
    super("UnitAdded", "Unit", unitId, tenantId, payload);
  }
}

export class UnitUpdatedEvent extends BaseDomainEvent {
  constructor(
    unitId: string,
    tenantId: string,
    payload: { propertyId: string; changedFields: string[] },
  ) {
    super("UnitUpdated", "Unit", unitId, tenantId, payload);
  }
}

export class UnitRemovedEvent extends BaseDomainEvent {
  constructor(
    unitId: string,
    tenantId: string,
    payload: { propertyId: string },
  ) {
    super("UnitRemoved", "Unit", unitId, tenantId, payload);
  }
}
