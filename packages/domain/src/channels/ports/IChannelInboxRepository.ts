import type { ChannelInboxItem } from "../domain/ChannelInboxItem";

export interface InsertChannelInboxResult {
  item: ChannelInboxItem;
  inserted: boolean;
}

export interface ClaimChannelInboxItemParams {
  tenantId: string;
  inboxItemId: string;
  workerId: string;
  processingToken: string;
  leaseExpiresAt: Date;
}

export interface CompleteChannelInboxItemParams {
  tenantId: string;
  inboxItemId: string;
  processingToken: string;
  status: ChannelInboxItem["status"];
  outcome: NonNullable<ChannelInboxItem["outcome"]>;
  outcomeDetail?: string | null;
  lastError?: string | null;
  resultBookingId?: string | null;
  resultLinkId?: string | null;
  processedAt: Date;
}

export interface MarkChannelInboxFailedParams {
  tenantId: string;
  inboxItemId: string;
  processingToken: string;
  outcome: NonNullable<ChannelInboxItem["outcome"]>;
  outcomeDetail?: string | null;
  lastError?: string | null;
  processedAt: Date;
}

export interface IChannelInboxRepository {
  insert(item: ChannelInboxItem): Promise<InsertChannelInboxResult>;
  findById(tenantId: string, inboxItemId: string): Promise<ChannelInboxItem | null>;
  findByDeduplicationKey(tenantId: string, deduplicationKey: string): Promise<ChannelInboxItem | null>;
  countReplayItemsForSource(tenantId: string, sourceInboxItemId: string): Promise<number>;
  claim(params: ClaimChannelInboxItemParams): Promise<ChannelInboxItem | null>;
  complete(params: CompleteChannelInboxItemParams): Promise<boolean>;
  markFailed(params: MarkChannelInboxFailedParams): Promise<boolean>;
}
