import { AggregateRoot } from "../../shared/kernel/Entity";
import { ValidationError } from "../../shared/errors/DomainError";
import type { ChannelSource } from "../types/ChannelSource";
import {
  ExternalReservationLinkStateMachine,
  type ExternalReservationLinkStatus,
} from "./ExternalReservationLinkStatus";

const MAX_ID_LENGTH = 255;
const MAX_REASON_LENGTH = 500;

export interface ExternalReservationLinkProps {
  id: string;
  tenantId: string;
  provider: ChannelSource;
  connectionId: string;
  externalReservationId: string;
  bookingId: string;
  mappingId: string;
  mappingVersionAtImport: number;
  mappingVersionAtLastSync: number;
  externalRevision: string | null;
  status: ExternalReservationLinkStatus;
  conflictReason: string | null;
  importedAt: Date;
  lastSyncedAt: Date | null;
  lastExternalUpdateAt: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateExternalReservationLinkProps {
  id: string;
  tenantId: string;
  provider: ChannelSource;
  connectionId: string;
  externalReservationId: string;
  bookingId: string;
  mappingId: string;
  mappingVersion: number;
  externalRevision?: string | null;
  lastExternalUpdateAt?: string | null;
  importedAt?: Date;
  now?: Date;
}

function normalizeIdentifier(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ID_LENGTH) {
    throw new ValidationError(`${label} must be between 1 and 255 characters`);
  }
  return trimmed;
}

function normalizeOptionalRevision(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ID_LENGTH) {
    throw new ValidationError("External revision must be between 1 and 255 characters");
  }
  return trimmed;
}

function assertMappingVersion(version: number): void {
  if (!Number.isInteger(version) || version < 1) {
    throw new ValidationError("Mapping version must be an integer greater than or equal to 1");
  }
}

export class ExternalReservationLink extends AggregateRoot<ExternalReservationLinkProps> {
  private constructor(props: ExternalReservationLinkProps) {
    super(props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get provider(): ChannelSource {
    return this.props.provider;
  }

  get connectionId(): string {
    return this.props.connectionId;
  }

  get externalReservationId(): string {
    return this.props.externalReservationId;
  }

  get bookingId(): string {
    return this.props.bookingId;
  }

  get mappingId(): string {
    return this.props.mappingId;
  }

  get mappingVersionAtImport(): number {
    return this.props.mappingVersionAtImport;
  }

  get mappingVersionAtLastSync(): number {
    return this.props.mappingVersionAtLastSync;
  }

  get externalRevision(): string | null {
    return this.props.externalRevision;
  }

  get status(): ExternalReservationLinkStatus {
    return this.props.status;
  }

  get conflictReason(): string | null {
    return this.props.conflictReason;
  }

  get importedAt(): Date {
    return this.props.importedAt;
  }

  get lastSyncedAt(): Date | null {
    return this.props.lastSyncedAt;
  }

  get lastExternalUpdateAt(): string | null {
    return this.props.lastExternalUpdateAt;
  }

  get archivedAt(): Date | null {
    return this.props.archivedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static createLink(props: CreateExternalReservationLinkProps): ExternalReservationLink {
    assertMappingVersion(props.mappingVersion);
    const now = props.now ?? new Date();
    const importedAt = props.importedAt ?? now;

    return new ExternalReservationLink({
      id: props.id,
      tenantId: props.tenantId,
      provider: props.provider,
      connectionId: normalizeIdentifier(props.connectionId, "Connection id"),
      externalReservationId: normalizeIdentifier(
        props.externalReservationId,
        "External reservation id",
      ),
      bookingId: normalizeIdentifier(props.bookingId, "Booking id"),
      mappingId: normalizeIdentifier(props.mappingId, "Mapping id"),
      mappingVersionAtImport: props.mappingVersion,
      mappingVersionAtLastSync: props.mappingVersion,
      externalRevision: normalizeOptionalRevision(props.externalRevision),
      status: "linked",
      conflictReason: null,
      importedAt,
      lastSyncedAt: importedAt,
      lastExternalUpdateAt: props.lastExternalUpdateAt ?? null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: ExternalReservationLinkProps): ExternalReservationLink {
    return new ExternalReservationLink({
      ...props,
      importedAt: new Date(props.importedAt),
      lastSyncedAt: props.lastSyncedAt ? new Date(props.lastSyncedAt) : null,
      archivedAt: props.archivedAt ? new Date(props.archivedAt) : null,
      createdAt: new Date(props.createdAt),
      updatedAt: new Date(props.updatedAt),
    });
  }

  toProps(): ExternalReservationLinkProps {
    return {
      id: this.props.id,
      tenantId: this.props.tenantId,
      provider: this.props.provider,
      connectionId: this.props.connectionId,
      externalReservationId: this.props.externalReservationId,
      bookingId: this.props.bookingId,
      mappingId: this.props.mappingId,
      mappingVersionAtImport: this.props.mappingVersionAtImport,
      mappingVersionAtLastSync: this.props.mappingVersionAtLastSync,
      externalRevision: this.props.externalRevision,
      status: this.props.status,
      conflictReason: this.props.conflictReason,
      importedAt: new Date(this.props.importedAt),
      lastSyncedAt: this.props.lastSyncedAt ? new Date(this.props.lastSyncedAt) : null,
      lastExternalUpdateAt: this.props.lastExternalUpdateAt,
      archivedAt: this.props.archivedAt ? new Date(this.props.archivedAt) : null,
      createdAt: new Date(this.props.createdAt),
      updatedAt: new Date(this.props.updatedAt),
    };
  }

  markSynced(
    update: {
      mappingVersion?: number;
      externalRevision?: string | null;
      lastExternalUpdateAt?: string | null;
    } = {},
    now: Date = new Date(),
  ): void {
    ExternalReservationLinkStateMachine.assertCanMarkSynced(this.props.status);
    this.props.status = "linked";
    this.props.lastSyncedAt = now;
    this.props.conflictReason = null;
    if (update.mappingVersion != null) {
      assertMappingVersion(update.mappingVersion);
      this.props.mappingVersionAtLastSync = update.mappingVersion;
    }
    if (update.externalRevision !== undefined) {
      this.props.externalRevision = normalizeOptionalRevision(update.externalRevision);
    }
    if (update.lastExternalUpdateAt !== undefined) {
      this.props.lastExternalUpdateAt = update.lastExternalUpdateAt;
    }
    this.touch(now);
  }

  markStale(now: Date = new Date()): void {
    ExternalReservationLinkStateMachine.assertCanMarkStale(this.props.status);
    this.props.status = "stale";
    this.touch(now);
  }

  markConflict(reason: string, now: Date = new Date()): void {
    ExternalReservationLinkStateMachine.assertCanMarkConflict(this.props.status);
    const trimmed = reason.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_REASON_LENGTH) {
      throw new ValidationError("Conflict reason must be between 1 and 500 characters");
    }
    this.props.status = "conflict";
    this.props.conflictReason = trimmed;
    this.touch(now);
  }

  updateExternalRevision(
    update: { revision: string | null; lastExternalUpdateAt?: string | null },
    now: Date = new Date(),
  ): void {
    ExternalReservationLinkStateMachine.assertCanMutate(this.props.status);
    this.props.externalRevision = normalizeOptionalRevision(update.revision);
    if (update.lastExternalUpdateAt !== undefined) {
      this.props.lastExternalUpdateAt = update.lastExternalUpdateAt;
    }
    this.touch(now);
  }

  updateMappingVersion(version: number, now: Date = new Date()): void {
    ExternalReservationLinkStateMachine.assertCanMutate(this.props.status);
    assertMappingVersion(version);
    this.props.mappingVersionAtLastSync = version;
    this.touch(now);
  }

  archive(now: Date = new Date()): void {
    ExternalReservationLinkStateMachine.assertCanArchive(this.props.status);
    this.props.status = "archived";
    this.props.archivedAt = now;
    this.props.conflictReason = null;
    this.touch(now);
  }

  private touch(now: Date = new Date()): void {
    this.props.updatedAt = now;
  }
}
