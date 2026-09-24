import type {
  ExternalReservationLink,
  IExternalReservationLinkRepository,
} from "@hcp/domain";
import { ExternalReservationLink as ExternalReservationLinkAggregate } from "@hcp/domain";
import type { ChannelSource, ExternalReservationLinkStatus } from "@hcp/domain";
import type { ExternalReservationLink as PrismaExternalReservationLink } from "@prisma/client";
import type { ExternalReservationLinkStatus as PrismaExternalReservationLinkStatus } from "@prisma/client";
import { withTenantTransaction } from "../../client";

function toDomain(record: PrismaExternalReservationLink): ExternalReservationLink {
  return ExternalReservationLinkAggregate.reconstitute({
    id: record.id,
    tenantId: record.tenantId,
    provider: record.provider as ChannelSource,
    connectionId: record.connectionId,
    externalReservationId: record.externalReservationId,
    bookingId: record.bookingId,
    mappingId: record.mappingId,
    mappingVersionAtImport: record.mappingVersionAtImport,
    mappingVersionAtLastSync: record.mappingVersionAtLastSync,
    externalRevision: record.externalRevision,
    status: record.status as ExternalReservationLinkStatus,
    conflictReason: record.conflictReason,
    importedAt: record.importedAt,
    lastSyncedAt: record.lastSyncedAt,
    lastExternalUpdateAt: record.lastExternalUpdateAt,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export class PrismaExternalReservationLinkRepository
  implements IExternalReservationLinkRepository
{
  async save(link: ExternalReservationLinkAggregate): Promise<void> {
    const props = link.toProps();
    await withTenantTransaction(props.tenantId, async (tx) => {
      await tx.externalReservationLink.upsert({
        where: { tenantId_id: { tenantId: props.tenantId, id: props.id } },
        create: {
          tenantId: props.tenantId,
          id: props.id,
          provider: props.provider,
          connectionId: props.connectionId,
          externalReservationId: props.externalReservationId,
          bookingId: props.bookingId,
          mappingId: props.mappingId,
          mappingVersionAtImport: props.mappingVersionAtImport,
          mappingVersionAtLastSync: props.mappingVersionAtLastSync,
          externalRevision: props.externalRevision,
          status: props.status as PrismaExternalReservationLinkStatus,
          conflictReason: props.conflictReason,
          importedAt: props.importedAt,
          lastSyncedAt: props.lastSyncedAt,
          lastExternalUpdateAt: props.lastExternalUpdateAt,
          archivedAt: props.archivedAt,
          createdAt: props.createdAt,
          updatedAt: props.updatedAt,
        },
        update: {
          provider: props.provider,
          connectionId: props.connectionId,
          externalReservationId: props.externalReservationId,
          bookingId: props.bookingId,
          mappingId: props.mappingId,
          mappingVersionAtImport: props.mappingVersionAtImport,
          mappingVersionAtLastSync: props.mappingVersionAtLastSync,
          externalRevision: props.externalRevision,
          status: props.status as PrismaExternalReservationLinkStatus,
          conflictReason: props.conflictReason,
          importedAt: props.importedAt,
          lastSyncedAt: props.lastSyncedAt,
          lastExternalUpdateAt: props.lastExternalUpdateAt,
          archivedAt: props.archivedAt,
          createdAt: props.createdAt,
          updatedAt: props.updatedAt,
        },
      });
    });
  }

  async findById(tenantId: string, linkId: string): Promise<ExternalReservationLink | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.externalReservationLink.findUnique({
        where: { tenantId_id: { tenantId, id: linkId } },
      });

      return record ? toDomain(record) : null;
    });
  }

  async findByExternalReservation(
    tenantId: string,
    connectionId: string,
    externalReservationId: string,
  ): Promise<ExternalReservationLink | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.externalReservationLink.findFirst({
        where: { tenantId, connectionId, externalReservationId },
      });

      return record ? toDomain(record) : null;
    });
  }

  async findByBookingId(tenantId: string, bookingId: string): Promise<ExternalReservationLink | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.externalReservationLink.findFirst({
        where: { tenantId, bookingId },
        orderBy: { updatedAt: "desc" },
      });

      return record ? toDomain(record) : null;
    });
  }

  async listByBookingId(tenantId: string, bookingId: string): Promise<ExternalReservationLink[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const records = await tx.externalReservationLink.findMany({
        where: { tenantId, bookingId },
        orderBy: { updatedAt: "desc" },
      });

      return records.map(toDomain);
    });
  }

  async listByConnection(tenantId: string, connectionId: string): Promise<ExternalReservationLink[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const records = await tx.externalReservationLink.findMany({
        where: { tenantId, connectionId },
        orderBy: { updatedAt: "desc" },
      });

      return records.map(toDomain);
    });
  }
}
