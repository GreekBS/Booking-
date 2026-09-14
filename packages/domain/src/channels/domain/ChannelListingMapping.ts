import { AggregateRoot } from "../../shared/kernel/Entity";
import { ValidationError } from "../../shared/errors/DomainError";
import type { SyncDirection } from "./SyncDirection";
import {
  ChannelListingMappingStateMachine,
  type ChannelListingMappingStatus,
} from "./ChannelListingMappingStatus";

const MAX_ID_LENGTH = 255;

export interface ChannelListingMappingProps {
  id: string;
  tenantId: string;
  connectionId: string;
  externalListingId: string;
  externalUnitId: string | null;
  propertyId: string;
  unitId: string;
  syncDirection: SyncDirection;
  status: ChannelListingMappingStatus;
  mappingVersion: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateActiveChannelListingMappingProps {
  id: string;
  tenantId: string;
  connectionId: string;
  externalListingId: string;
  externalUnitId?: string | null;
  propertyId: string;
  unitId: string;
  syncDirection: SyncDirection;
  now?: Date;
}

function normalizeIdentifier(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ID_LENGTH) {
    throw new ValidationError(`${label} must be between 1 and 255 characters`);
  }
  return trimmed;
}

function normalizeOptionalIdentifier(value: string | null | undefined, label: string): string | null {
  if (value == null) {
    return null;
  }
  return normalizeIdentifier(value, label);
}

export class ChannelListingMapping extends AggregateRoot<ChannelListingMappingProps> {
  private constructor(props: ChannelListingMappingProps) {
    super(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get connectionId(): string {
    return this.props.connectionId;
  }

  get externalListingId(): string {
    return this.props.externalListingId;
  }

  get externalUnitId(): string | null {
    return this.props.externalUnitId;
  }

  get propertyId(): string {
    return this.props.propertyId;
  }

  get unitId(): string {
    return this.props.unitId;
  }

  get syncDirection(): SyncDirection {
    return this.props.syncDirection;
  }

  get status(): ChannelListingMappingStatus {
    return this.props.status;
  }

  get mappingVersion(): number {
    return this.props.mappingVersion;
  }

  get lastError(): string | null {
    return this.props.lastError;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static createActive(props: CreateActiveChannelListingMappingProps): ChannelListingMapping {
    const now = props.now ?? new Date();
    return new ChannelListingMapping({
      id: props.id,
      tenantId: props.tenantId,
      connectionId: normalizeIdentifier(props.connectionId, "Connection id"),
      externalListingId: normalizeIdentifier(props.externalListingId, "External listing id"),
      externalUnitId: normalizeOptionalIdentifier(props.externalUnitId, "External unit id"),
      propertyId: normalizeIdentifier(props.propertyId, "Property id"),
      unitId: normalizeIdentifier(props.unitId, "Unit id"),
      syncDirection: props.syncDirection,
      status: "active",
      mappingVersion: 1,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: ChannelListingMappingProps): ChannelListingMapping {
    return new ChannelListingMapping({
      ...props,
      createdAt: new Date(props.createdAt),
      updatedAt: new Date(props.updatedAt),
    });
  }

  toProps(): ChannelListingMappingProps {
    return {
      id: this.props.id,
      tenantId: this.props.tenantId,
      connectionId: this.props.connectionId,
      externalListingId: this.props.externalListingId,
      externalUnitId: this.props.externalUnitId,
      propertyId: this.props.propertyId,
      unitId: this.props.unitId,
      syncDirection: this.props.syncDirection,
      status: this.props.status,
      mappingVersion: this.props.mappingVersion,
      lastError: this.props.lastError,
      createdAt: new Date(this.props.createdAt),
      updatedAt: new Date(this.props.updatedAt),
    };
  }

  pause(now: Date = new Date()): void {
    ChannelListingMappingStateMachine.assertCanPause(this.props.status);
    this.props.status = "paused";
    this.touch(now);
  }

  resume(now: Date = new Date()): void {
    ChannelListingMappingStateMachine.assertCanResume(this.props.status);
    this.props.status = "active";
    this.touch(now);
  }

  markUnmapped(now: Date = new Date()): void {
    ChannelListingMappingStateMachine.assertCanMarkUnmapped(this.props.status);
    this.props.status = "unmapped";
    this.touch(now);
  }

  markError(message: string, now: Date = new Date()): void {
    ChannelListingMappingStateMachine.assertCanMarkError(this.props.status);
    const trimmed = message.trim();
    if (trimmed.length === 0 || trimmed.length > 500) {
      throw new ValidationError("Error message must be between 1 and 500 characters");
    }
    this.props.status = "error";
    this.props.lastError = trimmed;
    this.touch(now);
  }

  updateInternalMapping(
    mapping: { propertyId: string; unitId: string },
    now: Date = new Date(),
  ): void {
    const propertyId = normalizeIdentifier(mapping.propertyId, "Property id");
    const unitId = normalizeIdentifier(mapping.unitId, "Unit id");
    this.applyStructuralChange(() => {
      if (this.props.propertyId === propertyId && this.props.unitId === unitId) {
        return false;
      }
      this.props.propertyId = propertyId;
      this.props.unitId = unitId;
      return true;
    }, now);
  }

  updateExternalMapping(
    mapping: { externalListingId: string; externalUnitId?: string | null },
    now: Date = new Date(),
  ): void {
    const externalListingId = normalizeIdentifier(mapping.externalListingId, "External listing id");
    const externalUnitId = normalizeOptionalIdentifier(mapping.externalUnitId, "External unit id");
    this.applyStructuralChange(() => {
      if (
        this.props.externalListingId === externalListingId &&
        this.props.externalUnitId === externalUnitId
      ) {
        return false;
      }
      this.props.externalListingId = externalListingId;
      this.props.externalUnitId = externalUnitId;
      return true;
    }, now);
  }

  updateSyncDirection(direction: SyncDirection, now: Date = new Date()): void {
    this.applyStructuralChange(() => {
      if (this.props.syncDirection === direction) {
        return false;
      }
      this.props.syncDirection = direction;
      return true;
    }, now);
  }

  archive(now: Date = new Date()): void {
    ChannelListingMappingStateMachine.assertCanArchive(this.props.status);
    this.props.status = "archived";
    this.touch(now);
  }

  private applyStructuralChange(apply: () => boolean, now: Date): void {
    ChannelListingMappingStateMachine.assertCanMutate(this.props.status);
    const changed = apply();
    if (!changed) {
      return;
    }
    this.props.mappingVersion += 1;
    if (this.props.status === "unmapped" || this.props.status === "error") {
      this.props.status = "active";
      this.props.lastError = null;
    }
    this.touch(now);
  }

  private touch(now: Date = new Date()): void {
    this.props.updatedAt = now;
  }
}
