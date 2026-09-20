import type { BackgroundJobStatus, OutboxEventStatus } from "../../shared/types/index";
import type { ChannelConnectionStatus } from "../../channels/domain/ChannelConnectionStatus";
import type { ChannelInboxProcessingStatus } from "../../channels/domain/ChannelInboxProcessingStatus";

export type PlatformInboxOutcome =
  | "SUCCESS"
  | "DUPLICATE"
  | "AVAILABILITY_CONFLICT"
  | "VALIDATION_ERROR"
  | "PROVIDER_ERROR"
  | "UNSUPPORTED"
  | "STALE_MAPPING"
  | "TRANSIENT_ERROR"
  | "INTERNAL_ERROR";

export interface PlatformPage<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface PlatformChannelConnectionRow {
  connectionId: string;
  tenantId: string;
  tenantName: string;
  provider: string;
  displayName: string;
  status: ChannelConnectionStatus;
  lastError: string | null;
  hasCredentialRef: boolean;
  inventoryApplyEnabled: boolean;
  mappingCount: number;
  /** Distinct mapped property ids when available — not a sync timestamp. */
  propertyIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PlatformChannelMappingRow {
  mappingId: string;
  externalListingId: string;
  externalUnitId: string | null;
  propertyId: string;
  unitId: string;
  status: string;
  syncDirection: string;
  lastError: string | null;
  updatedAt: Date;
}

export interface PlatformChannelInboxRow {
  tenantId: string;
  inboxItemId: string;
  connectionId: string;
  provider: string;
  messageKind: string;
  ingressKind: string;
  status: ChannelInboxProcessingStatus;
  outcome: PlatformInboxOutcome | null;
  attemptCount: number;
  lastError: string | null;
  outcomeDetail: string | null;
  receivedAt: Date;
  createdAt: Date;
  processedAt: Date | null;
}

export interface PlatformChannelConnectionDetail {
  connection: PlatformChannelConnectionRow;
  mappings: PlatformChannelMappingRow[];
  recentInbox: PlatformChannelInboxRow[];
  pollCursorUpdatedAt: Date | null;
}

export interface PlatformBackgroundJobRow {
  id: string;
  tenantId: string | null;
  jobType: string;
  status: BackgroundJobStatus;
  priority: number;
  attemptCount: number;
  maxAttempts: number;
  runAt: Date;
  lastError: string | null;
  createdAt: Date;
  claimedAt: Date | null;
  completedAt: Date | null;
}

export interface PlatformOutboxRow {
  id: string;
  tenantId: string | null;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  status: OutboxEventStatus;
  attemptCount: number;
  lastError: string | null;
  createdAt: Date;
  claimedAt: Date | null;
  processedAt: Date | null;
}

export interface ListPlatformChannelsQuery {
  page: number;
  limit: number;
  q?: string;
  tenantId?: string;
  provider?: string;
  status?: ChannelConnectionStatus;
}

export interface ListPlatformJobsQuery {
  page: number;
  limit: number;
  status?: BackgroundJobStatus;
  jobType?: string;
  tenantId?: string;
}

export interface ListPlatformInboxQuery {
  page: number;
  limit: number;
  status?: ChannelInboxProcessingStatus;
  provider?: string;
  tenantId?: string;
  connectionId?: string;
}

export interface ListPlatformOutboxQuery {
  page: number;
  limit: number;
  status?: OutboxEventStatus;
  eventType?: string;
  tenantId?: string;
}

export interface PlatformStatusCount {
  status: string;
  count: number;
}

export interface PlatformOperationsHealth {
  connections: PlatformStatusCount[];
  jobs: PlatformStatusCount[];
  inbox: PlatformStatusCount[];
  outbox: PlatformStatusCount[];
}

export interface PlatformOperationsAttention {
  connectionsError: number;
  jobsDeadLetter: number;
  jobsFailedPending: number;
  inboxFailed: number;
  inboxDeadLetter: number;
  outboxDeadLetter: number;
}

/**
 * Cross-tenant Platform Admin operational reads.
 * Authorization is the caller's responsibility (requireSuperAdmin).
 * Never returns credential material or raw secret ciphertext.
 */
export interface IPlatformOperationsRepository {
  listConnections(
    query: ListPlatformChannelsQuery,
  ): Promise<PlatformPage<PlatformChannelConnectionRow>>;
  getConnectionDetail(
    tenantId: string,
    connectionId: string,
  ): Promise<PlatformChannelConnectionDetail | null>;
  listJobs(
    query: ListPlatformJobsQuery,
  ): Promise<PlatformPage<PlatformBackgroundJobRow>>;
  listInbox(
    query: ListPlatformInboxQuery,
  ): Promise<PlatformPage<PlatformChannelInboxRow>>;
  listOutbox(
    query: ListPlatformOutboxQuery,
  ): Promise<PlatformPage<PlatformOutboxRow>>;
  getHealthSummary(): Promise<PlatformOperationsHealth>;
  getAttentionSignals(): Promise<PlatformOperationsAttention>;
}
