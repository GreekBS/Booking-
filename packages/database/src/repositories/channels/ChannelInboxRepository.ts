import {
  ChannelInboxItem,
  type IChannelInboxRepository,
  type ClaimChannelInboxItemParams,
  type CompleteChannelInboxItemParams,
  type InsertChannelInboxResult,
  type MarkChannelInboxFailedParams,
} from "@hcp/domain";
import { Prisma } from "@prisma/client";
import { prisma, setTenantContext } from "../../client";
import { toDomainInboxItem, toPrismaCreateData } from "./channelInboxMappers";

type InboxRow = {
  tenant_id: string;
  id: string;
  connection_id: string;
  provider: string;
  ingress_kind: string;
  message_kind: string;
  provider_event_id: string;
  deduplication_key: string;
  correlation_id: string | null;
  raw_payload: unknown;
  external_listing_id: string | null;
  external_unit_id: string | null;
  external_reservation_id: string | null;
  external_revision: string | null;
  provider_revision: string | null;
  provider_sequence: string | null;
  provider_event_time: Date | null;
  received_at: Date;
  created_at: Date;
  status: string;
  outcome: string | null;
  outcome_detail: string | null;
  attempt_count: number;
  last_error: string | null;
  lease_owner: string | null;
  lease_expires_at: Date | null;
  lease_heartbeat_at: Date | null;
  processing_token: string | null;
  processing_started_at: Date | null;
  processed_at: Date | null;
  result_booking_id: string | null;
  result_link_id: string | null;
  updated_at: Date;
};

function mapRow(row: InboxRow): ChannelInboxItem {
  return toDomainInboxItem({
    tenantId: row.tenant_id,
    id: row.id,
    connectionId: row.connection_id,
    provider: row.provider,
    ingressKind: row.ingress_kind,
    messageKind: row.message_kind,
    providerEventId: row.provider_event_id,
    deduplicationKey: row.deduplication_key,
    correlationId: row.correlation_id,
    rawPayload: row.raw_payload,
    externalListingId: row.external_listing_id,
    externalUnitId: row.external_unit_id,
    externalReservationId: row.external_reservation_id,
    externalRevision: row.external_revision,
    providerRevision: row.provider_revision,
    providerSequence: row.provider_sequence,
    providerEventTime: row.provider_event_time,
    receivedAt: row.received_at,
    createdAt: row.created_at,
    status: row.status,
    outcome: row.outcome,
    outcomeDetail: row.outcome_detail,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at,
    leaseHeartbeatAt: row.lease_heartbeat_at,
    processingToken: row.processing_token,
    processingStartedAt: row.processing_started_at,
    processedAt: row.processed_at,
    resultBookingId: row.result_booking_id,
    resultLinkId: row.result_link_id,
    updatedAt: row.updated_at,
  } as Parameters<typeof toDomainInboxItem>[0]);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export class PrismaChannelInboxRepository implements IChannelInboxRepository {
  async insert(item: ChannelInboxItem): Promise<InsertChannelInboxResult> {
    const props = item.toProps();
    await setTenantContext(prisma, props.tenantId);

    try {
      const created = await prisma.channelInboxItem.create({
        data: toPrismaCreateData(item),
      });
      return { item: toDomainInboxItem(created), inserted: true };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const existing = await this.findByDeduplicationKey(props.tenantId, props.deduplicationKey);
      if (!existing) {
        throw error;
      }
      return { item: existing, inserted: false };
    }
  }

  async findById(tenantId: string, inboxItemId: string): Promise<ChannelInboxItem | null> {
    await setTenantContext(prisma, tenantId);
    const record = await prisma.channelInboxItem.findUnique({
      where: { tenantId_id: { tenantId, id: inboxItemId } },
    });
    return record ? toDomainInboxItem(record) : null;
  }

  async findByDeduplicationKey(
    tenantId: string,
    deduplicationKey: string,
  ): Promise<ChannelInboxItem | null> {
    await setTenantContext(prisma, tenantId);
    const record = await prisma.channelInboxItem.findFirst({
      where: { tenantId, deduplicationKey },
    });
    return record ? toDomainInboxItem(record) : null;
  }

  async countReplayItemsForSource(tenantId: string, sourceInboxItemId: string): Promise<number> {
    await setTenantContext(prisma, tenantId);
    const prefix = `ingress:replay:${sourceInboxItemId}:`;
    return prisma.channelInboxItem.count({
      where: {
        tenantId,
        deduplicationKey: { startsWith: prefix },
      },
    });
  }

  async claim(params: ClaimChannelInboxItemParams): Promise<ChannelInboxItem | null> {
    await setTenantContext(prisma, params.tenantId);
    const rows = await prisma.$queryRaw<InboxRow[]>`
      UPDATE "channel_inbox_items"
      SET
        "status" = 'processing'::"ChannelInboxProcessingStatus",
        "lease_owner" = ${params.workerId},
        "lease_expires_at" = ${params.leaseExpiresAt},
        "processing_token" = ${params.processingToken},
        "processing_started_at" = NOW(),
        "attempt_count" = "attempt_count" + 1,
        "updated_at" = NOW()
      WHERE "tenant_id" = ${params.tenantId}::uuid
        AND "id" = ${params.inboxItemId}
        AND (
          "status" IN ('received'::"ChannelInboxProcessingStatus", 'failed'::"ChannelInboxProcessingStatus")
          OR (
            "status" = 'processing'::"ChannelInboxProcessingStatus"
            AND "lease_expires_at" IS NOT NULL
            AND "lease_expires_at" < NOW()
          )
        )
      RETURNING *
    `;
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async complete(params: CompleteChannelInboxItemParams): Promise<boolean> {
    await setTenantContext(prisma, params.tenantId);
    const updated = await prisma.channelInboxItem.updateMany({
      where: {
        tenantId: params.tenantId,
        id: params.inboxItemId,
        processingToken: params.processingToken,
      },
      data: {
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
      },
    });
    return updated.count === 1;
  }

  async markFailed(params: MarkChannelInboxFailedParams): Promise<boolean> {
    await setTenantContext(prisma, params.tenantId);
    const updated = await prisma.channelInboxItem.updateMany({
      where: {
        tenantId: params.tenantId,
        id: params.inboxItemId,
        processingToken: params.processingToken,
      },
      data: {
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
      },
    });
    return updated.count === 1;
  }
}
