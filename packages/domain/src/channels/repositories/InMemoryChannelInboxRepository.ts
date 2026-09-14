import { ChannelInboxItem } from "../domain/ChannelInboxItem";
import type {
  ClaimChannelInboxItemParams,
  CompleteChannelInboxItemParams,
  IChannelInboxRepository,
  InsertChannelInboxResult,
  MarkChannelInboxFailedParams,
} from "../ports/IChannelInboxRepository";

export class InMemoryChannelInboxRepository implements IChannelInboxRepository {
  private readonly items = new Map<string, ChannelInboxItem>();

  private key(item: ChannelInboxItem): string {
    return `${item.tenantId}:${item.id}`;
  }

  private dedupKey(tenantId: string, deduplicationKey: string): string {
    return `${tenantId}:${deduplicationKey}`;
  }

  async insert(item: ChannelInboxItem): Promise<InsertChannelInboxResult> {
    const existing = await this.findByDeduplicationKey(item.tenantId, item.deduplicationKey);
    if (existing) {
      return { item: existing, inserted: false };
    }
    this.items.set(this.key(item), item);
    return { item, inserted: true };
  }

  async findById(tenantId: string, inboxItemId: string): Promise<ChannelInboxItem | null> {
    return this.items.get(`${tenantId}:${inboxItemId}`) ?? null;
  }

  async findByDeduplicationKey(
    tenantId: string,
    deduplicationKey: string,
  ): Promise<ChannelInboxItem | null> {
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId && item.deduplicationKey === deduplicationKey) {
        return item;
      }
    }
    return null;
  }

  async countReplayItemsForSource(tenantId: string, sourceInboxItemId: string): Promise<number> {
    const prefix = `ingress:replay:${sourceInboxItemId}:`;
    let count = 0;
    for (const item of this.items.values()) {
      if (item.tenantId === tenantId && item.deduplicationKey.startsWith(prefix)) {
        count += 1;
      }
    }
    return count;
  }

  async claim(params: ClaimChannelInboxItemParams): Promise<ChannelInboxItem | null> {
    const current = await this.findById(params.tenantId, params.inboxItemId);
    if (!current) {
      return null;
    }

    const props = current.toProps();
    const now = new Date();
    const leaseExpired =
      props.status === "processing" &&
      props.leaseExpiresAt != null &&
      props.leaseExpiresAt.getTime() <= now.getTime();
    const claimable =
      props.status === "received" || props.status === "failed" || leaseExpired;

    if (!claimable) {
      return null;
    }

    const claimed = ChannelInboxItem.reconstitute({
      ...props,
      status: "processing",
      leaseOwner: params.workerId,
      leaseExpiresAt: params.leaseExpiresAt,
      processingToken: params.processingToken,
      processingStartedAt: now,
      attemptCount: props.attemptCount + 1,
      updatedAt: now,
    });
    this.items.set(this.key(claimed), claimed);
    return claimed;
  }

  async complete(params: CompleteChannelInboxItemParams): Promise<boolean> {
    const current = await this.findById(params.tenantId, params.inboxItemId);
    if (!current || current.processingToken !== params.processingToken) {
      return false;
    }

    const props = current.toProps();
    const completed = ChannelInboxItem.reconstitute({
      ...props,
      status: params.status,
      outcome: params.outcome,
      outcomeDetail: params.outcomeDetail ?? null,
      lastError: params.lastError ?? null,
      resultBookingId: params.resultBookingId ?? null,
      resultLinkId: params.resultLinkId ?? null,
      processedAt: params.processedAt,
      leaseOwner: null,
      leaseExpiresAt: null,
      leaseHeartbeatAt: null,
      processingToken: null,
      processingStartedAt: null,
      updatedAt: params.processedAt,
    });
    this.items.set(this.key(completed), completed);
    return true;
  }

  listAllForTest(): ChannelInboxItem[] {
    return [...this.items.values()];
  }

  async markFailed(params: MarkChannelInboxFailedParams): Promise<boolean> {
    const current = await this.findById(params.tenantId, params.inboxItemId);
    if (!current || current.processingToken !== params.processingToken) {
      return false;
    }

    const props = current.toProps();
    const failed = ChannelInboxItem.reconstitute({
      ...props,
      status: "failed",
      outcome: params.outcome,
      outcomeDetail: params.outcomeDetail ?? null,
      lastError: params.lastError ?? null,
      processedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      leaseHeartbeatAt: null,
      processingToken: null,
      processingStartedAt: null,
      updatedAt: params.processedAt,
    });
    this.items.set(this.key(failed), failed);
    return true;
  }
}
