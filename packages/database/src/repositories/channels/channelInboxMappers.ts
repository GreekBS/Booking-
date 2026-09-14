import { ChannelInboxItem } from "@hcp/domain";
import type {
  ChannelInboxIngressKind,
  ChannelInboxProcessingOutcome,
  ChannelInboxProcessingStatus,
} from "@hcp/domain";
import type { ChannelInboxItem as PrismaChannelInboxItem } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export function toDomainInboxItem(record: PrismaChannelInboxItem): ChannelInboxItem {
  return ChannelInboxItem.reconstitute({
    id: record.id,
    tenantId: record.tenantId,
    connectionId: record.connectionId,
    provider: record.provider as ChannelInboxItem["provider"],
    ingressKind: record.ingressKind as ChannelInboxIngressKind,
    messageKind: record.messageKind as ChannelInboxItem["messageKind"],
    providerEventId: record.providerEventId,
    deduplicationKey: record.deduplicationKey,
    correlationId: record.correlationId,
    rawPayload: record.rawPayload as Record<string, unknown>,
    externalListingId: record.externalListingId,
    externalUnitId: record.externalUnitId,
    externalReservationId: record.externalReservationId,
    externalRevision: record.externalRevision,
    providerRevision: record.providerRevision,
    providerSequence: record.providerSequence,
    providerEventTime: record.providerEventTime,
    receivedAt: record.receivedAt,
    createdAt: record.createdAt,
    status: record.status as ChannelInboxProcessingStatus,
    outcome: record.outcome as ChannelInboxProcessingOutcome | null,
    outcomeDetail: record.outcomeDetail,
    attemptCount: record.attemptCount,
    lastError: record.lastError,
    leaseOwner: record.leaseOwner,
    leaseExpiresAt: record.leaseExpiresAt,
    leaseHeartbeatAt: record.leaseHeartbeatAt,
    processingToken: record.processingToken,
    processingStartedAt: record.processingStartedAt,
    processedAt: record.processedAt,
    resultBookingId: record.resultBookingId,
    resultLinkId: record.resultLinkId,
    updatedAt: record.updatedAt,
  });
}

export function toPrismaCreateData(
  item: ChannelInboxItem,
): Prisma.ChannelInboxItemUncheckedCreateInput {
  const props = item.toProps();
  return {
    tenantId: props.tenantId,
    id: props.id,
    connectionId: props.connectionId,
    provider: props.provider,
    ingressKind: props.ingressKind,
    messageKind: props.messageKind,
    providerEventId: props.providerEventId,
    deduplicationKey: props.deduplicationKey,
    correlationId: props.correlationId,
    rawPayload: props.rawPayload as Prisma.InputJsonValue,
    externalListingId: props.externalListingId,
    externalUnitId: props.externalUnitId,
    externalReservationId: props.externalReservationId,
    externalRevision: props.externalRevision,
    providerRevision: props.providerRevision,
    providerSequence: props.providerSequence,
    providerEventTime: props.providerEventTime,
    receivedAt: props.receivedAt,
    createdAt: props.createdAt,
    status: props.status,
    outcome: props.outcome,
    outcomeDetail: props.outcomeDetail,
    attemptCount: props.attemptCount,
    lastError: props.lastError,
    leaseOwner: props.leaseOwner,
    leaseExpiresAt: props.leaseExpiresAt,
    leaseHeartbeatAt: props.leaseHeartbeatAt,
    processingToken: props.processingToken,
    processingStartedAt: props.processingStartedAt,
    processedAt: props.processedAt,
    resultBookingId: props.resultBookingId,
    resultLinkId: props.resultLinkId,
    updatedAt: props.updatedAt,
  };
}
