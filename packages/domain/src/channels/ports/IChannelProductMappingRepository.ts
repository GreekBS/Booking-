import type { ChannelProductMapping } from "../domain/ChannelProductMapping";
import type { ChannelProductMappingKind } from "../domain/ChannelProductMapping";

export interface IChannelProductMappingRepository {
  findById(tenantId: string, id: string): Promise<ChannelProductMapping | null>;
  listByConnection(
    tenantId: string,
    connectionId: string,
  ): Promise<readonly ChannelProductMapping[]>;
  listActiveByConnectionAndKind(
    tenantId: string,
    connectionId: string,
    kind: ChannelProductMappingKind,
  ): Promise<readonly ChannelProductMapping[]>;
  save(mapping: ChannelProductMapping): Promise<void>;
}

export interface ChannelConnectionProviderSetupRecord {
  tenantId: string;
  connectionId: string;
  provider: string;
  setup: Record<string, unknown>;
  mappingConfigGeneration: number;
  updatedAt: Date;
}

export interface IChannelConnectionProviderSetupRepository {
  get(
    tenantId: string,
    connectionId: string,
  ): Promise<ChannelConnectionProviderSetupRecord | null>;
  upsert(record: ChannelConnectionProviderSetupRecord): Promise<void>;
  bumpMappingConfigGeneration(
    tenantId: string,
    connectionId: string,
  ): Promise<number>;
}

export type ChannelInitialSyncPreviewStatus =
  | "pending"
  | "confirmed"
  | "superseded"
  | "expired";

export interface ChannelInitialSyncPreviewRecord {
  id: string;
  tenantId: string;
  connectionId: string;
  /** Confirmation token — opaque hash; never guessable boolean. */
  confirmationToken: string;
  mappingConfigGeneration: number;
  talosStateFingerprint: string;
  remoteSnapshotFingerprint: string;
  summary: Record<string, unknown>;
  status: ChannelInitialSyncPreviewStatus;
  createdAt: Date;
  confirmedAt: Date | null;
}

export interface IChannelInitialSyncPreviewRepository {
  save(preview: ChannelInitialSyncPreviewRecord): Promise<void>;
  findById(
    tenantId: string,
    previewId: string,
  ): Promise<ChannelInitialSyncPreviewRecord | null>;
  findPendingByToken(
    tenantId: string,
    connectionId: string,
    confirmationToken: string,
  ): Promise<ChannelInitialSyncPreviewRecord | null>;
  markConfirmed(input: {
    tenantId: string;
    previewId: string;
    confirmedAt: Date;
  }): Promise<void>;
  supersedePending(
    tenantId: string,
    connectionId: string,
    exceptPreviewId?: string,
  ): Promise<void>;
}

export type ChannelReconciliationOutcomeCode =
  | "IN_SYNC"
  | "LOCAL_AHEAD"
  | "REMOTE_DRIFT"
  | "MAPPING_DRIFT"
  | "MISSING_RESERVATION"
  | "PROVIDER_UNAVAILABLE"
  | "BLOCKED_MAPPING"
  | "REQUIRES_OPERATOR_ATTENTION";

export interface ChannelReconciliationRunRecord {
  id: string;
  tenantId: string;
  connectionId: string;
  scope: "reservations" | "ari" | "mappings";
  outcome: ChannelReconciliationOutcomeCode;
  mappingConfigGeneration: number;
  autoHealEnqueued: boolean;
  details: Record<string, unknown>;
  completedAt: Date;
}

export interface IChannelReconciliationRunRepository {
  save(run: ChannelReconciliationRunRecord): Promise<void>;
  listRecent(
    tenantId: string,
    connectionId: string,
    limit: number,
  ): Promise<readonly ChannelReconciliationRunRecord[]>;
}
