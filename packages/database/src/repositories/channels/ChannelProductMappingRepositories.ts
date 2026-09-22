import {
  ChannelProductMapping,
  type ChannelProductMappingKind,
  type ChannelProductMappingStatus,
} from "@hcp/domain";
import type {
  ChannelConnectionProviderSetupRecord,
  ChannelInitialSyncPreviewRecord,
  ChannelInitialSyncPreviewStatus,
  ChannelReconciliationOutcomeCode,
  ChannelReconciliationRunRecord,
  IChannelConnectionProviderSetupRepository,
  IChannelInitialSyncPreviewRepository,
  IChannelProductMappingRepository,
  IChannelReconciliationRunRepository,
} from "@hcp/domain";
import { Prisma } from "@prisma/client";
import { prisma, setTenantContext } from "../../client";
import { createDefaultBookingComConnectionSetup } from "@hcp/domain";

function toDomainProduct(record: {
  tenantId: string;
  id: string;
  connectionId: string;
  provider: string;
  kind: string;
  propertyId: string | null;
  unitId: string | null;
  ratePlanId: string | null;
  externalHotelId: string | null;
  externalRoomTypeId: string | null;
  externalRatePlanId: string | null;
  externalRoomRateKey: string | null;
  status: string;
  mappingVersion: number;
  mappingConfigGeneration: number;
  createdAt: Date;
  updatedAt: Date;
}): ChannelProductMapping {
  return ChannelProductMapping.reconstitute({
    tenantId: record.tenantId,
    id: record.id,
    connectionId: record.connectionId,
    provider: record.provider as ChannelProductMapping["provider"],
    kind: record.kind as ChannelProductMappingKind,
    propertyId: record.propertyId,
    unitId: record.unitId,
    ratePlanId: record.ratePlanId,
    externalHotelId: record.externalHotelId,
    externalRoomTypeId: record.externalRoomTypeId,
    externalRatePlanId: record.externalRatePlanId,
    externalRoomRateKey: record.externalRoomRateKey,
    status: record.status as ChannelProductMappingStatus,
    mappingVersion: record.mappingVersion,
    mappingConfigGeneration: record.mappingConfigGeneration,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

export class PrismaChannelProductMappingRepository
  implements IChannelProductMappingRepository
{
  async findById(tenantId: string, id: string): Promise<ChannelProductMapping | null> {
    await setTenantContext(prisma, tenantId);
    const record = await prisma.channelProductMapping.findUnique({
      where: { tenantId_id: { tenantId, id } },
    });
    return record ? toDomainProduct(record) : null;
  }

  async listByConnection(
    tenantId: string,
    connectionId: string,
  ): Promise<readonly ChannelProductMapping[]> {
    await setTenantContext(prisma, tenantId);
    const records = await prisma.channelProductMapping.findMany({
      where: { tenantId, connectionId },
      orderBy: { updatedAt: "desc" },
    });
    return records.map(toDomainProduct);
  }

  async listActiveByConnectionAndKind(
    tenantId: string,
    connectionId: string,
    kind: ChannelProductMappingKind,
  ): Promise<readonly ChannelProductMapping[]> {
    await setTenantContext(prisma, tenantId);
    const records = await prisma.channelProductMapping.findMany({
      where: { tenantId, connectionId, kind, status: "active" },
    });
    return records.map(toDomainProduct);
  }

  async save(mapping: ChannelProductMapping): Promise<void> {
    const props = mapping.toProps();
    await setTenantContext(prisma, props.tenantId);
    await prisma.channelProductMapping.upsert({
      where: { tenantId_id: { tenantId: props.tenantId, id: props.id } },
      create: {
        tenantId: props.tenantId,
        id: props.id,
        connectionId: props.connectionId,
        provider: props.provider,
        kind: props.kind,
        propertyId: props.propertyId,
        unitId: props.unitId,
        ratePlanId: props.ratePlanId,
        externalHotelId: props.externalHotelId,
        externalRoomTypeId: props.externalRoomTypeId,
        externalRatePlanId: props.externalRatePlanId,
        externalRoomRateKey: props.externalRoomRateKey,
        status: props.status,
        mappingVersion: props.mappingVersion,
        mappingConfigGeneration: props.mappingConfigGeneration,
        createdAt: props.createdAt,
        updatedAt: props.updatedAt,
      },
      update: {
        connectionId: props.connectionId,
        provider: props.provider,
        kind: props.kind,
        propertyId: props.propertyId,
        unitId: props.unitId,
        ratePlanId: props.ratePlanId,
        externalHotelId: props.externalHotelId,
        externalRoomTypeId: props.externalRoomTypeId,
        externalRatePlanId: props.externalRatePlanId,
        externalRoomRateKey: props.externalRoomRateKey,
        status: props.status,
        mappingVersion: props.mappingVersion,
        mappingConfigGeneration: props.mappingConfigGeneration,
        updatedAt: props.updatedAt,
      },
    });
  }
}

export class PrismaChannelConnectionProviderSetupRepository
  implements IChannelConnectionProviderSetupRepository
{
  async get(
    tenantId: string,
    connectionId: string,
  ): Promise<ChannelConnectionProviderSetupRecord | null> {
    await setTenantContext(prisma, tenantId);
    const record = await prisma.channelConnectionProviderSetup.findUnique({
      where: { tenantId_connectionId: { tenantId, connectionId } },
    });
    if (!record) return null;
    return {
      tenantId: record.tenantId,
      connectionId: record.connectionId,
      provider: record.provider,
      setup: record.setupJson as Record<string, unknown>,
      mappingConfigGeneration: record.mappingConfigGeneration,
      updatedAt: record.updatedAt,
    };
  }

  async upsert(record: ChannelConnectionProviderSetupRecord): Promise<void> {
    await setTenantContext(prisma, record.tenantId);
    await prisma.channelConnectionProviderSetup.upsert({
      where: {
        tenantId_connectionId: {
          tenantId: record.tenantId,
          connectionId: record.connectionId,
        },
      },
      create: {
        tenantId: record.tenantId,
        connectionId: record.connectionId,
        provider: record.provider,
        setupJson: record.setup as Prisma.InputJsonValue,
        mappingConfigGeneration: record.mappingConfigGeneration,
        updatedAt: record.updatedAt,
      },
      update: {
        provider: record.provider,
        setupJson: record.setup as Prisma.InputJsonValue,
        mappingConfigGeneration: record.mappingConfigGeneration,
        updatedAt: record.updatedAt,
      },
    });
  }

  async bumpMappingConfigGeneration(
    tenantId: string,
    connectionId: string,
  ): Promise<number> {
    const existing = await this.get(tenantId, connectionId);
    const nextGen = (existing?.mappingConfigGeneration ?? 0) + 1;
    const setup =
      existing?.setup ??
      (createDefaultBookingComConnectionSetup() as unknown as Record<string, unknown>);
    await this.upsert({
      tenantId,
      connectionId,
      provider: existing?.provider ?? "booking_com",
      setup,
      mappingConfigGeneration: nextGen,
      updatedAt: new Date(),
    });
    return nextGen;
  }
}

export class PrismaChannelInitialSyncPreviewRepository
  implements IChannelInitialSyncPreviewRepository
{
  async save(preview: ChannelInitialSyncPreviewRecord): Promise<void> {
    await setTenantContext(prisma, preview.tenantId);
    await prisma.channelInitialSyncPreview.upsert({
      where: { tenantId_id: { tenantId: preview.tenantId, id: preview.id } },
      create: {
        tenantId: preview.tenantId,
        id: preview.id,
        connectionId: preview.connectionId,
        confirmationToken: preview.confirmationToken,
        mappingConfigGeneration: preview.mappingConfigGeneration,
        talosStateFingerprint: preview.talosStateFingerprint,
        remoteSnapshotFingerprint: preview.remoteSnapshotFingerprint,
        summaryJson: preview.summary as Prisma.InputJsonValue,
        status: preview.status,
        createdAt: preview.createdAt,
        confirmedAt: preview.confirmedAt,
      },
      update: {
        confirmationToken: preview.confirmationToken,
        mappingConfigGeneration: preview.mappingConfigGeneration,
        talosStateFingerprint: preview.talosStateFingerprint,
        remoteSnapshotFingerprint: preview.remoteSnapshotFingerprint,
        summaryJson: preview.summary as Prisma.InputJsonValue,
        status: preview.status,
        confirmedAt: preview.confirmedAt,
      },
    });
  }

  async findById(
    tenantId: string,
    previewId: string,
  ): Promise<ChannelInitialSyncPreviewRecord | null> {
    await setTenantContext(prisma, tenantId);
    const record = await prisma.channelInitialSyncPreview.findUnique({
      where: { tenantId_id: { tenantId, id: previewId } },
    });
    return record ? mapPreview(record) : null;
  }

  async findPendingByToken(
    tenantId: string,
    connectionId: string,
    confirmationToken: string,
  ): Promise<ChannelInitialSyncPreviewRecord | null> {
    await setTenantContext(prisma, tenantId);
    const record = await prisma.channelInitialSyncPreview.findFirst({
      where: {
        tenantId,
        connectionId,
        confirmationToken,
        status: "pending",
      },
    });
    return record ? mapPreview(record) : null;
  }

  async markConfirmed(input: {
    tenantId: string;
    previewId: string;
    confirmedAt: Date;
  }): Promise<void> {
    await setTenantContext(prisma, input.tenantId);
    await prisma.channelInitialSyncPreview.update({
      where: { tenantId_id: { tenantId: input.tenantId, id: input.previewId } },
      data: { status: "confirmed", confirmedAt: input.confirmedAt },
    });
  }

  async supersedePending(
    tenantId: string,
    connectionId: string,
    exceptPreviewId?: string,
  ): Promise<void> {
    await setTenantContext(prisma, tenantId);
    await prisma.channelInitialSyncPreview.updateMany({
      where: {
        tenantId,
        connectionId,
        status: "pending",
        ...(exceptPreviewId ? { id: { not: exceptPreviewId } } : {}),
      },
      data: { status: "superseded" },
    });
  }
}

function mapPreview(record: {
  tenantId: string;
  id: string;
  connectionId: string;
  confirmationToken: string;
  mappingConfigGeneration: number;
  talosStateFingerprint: string;
  remoteSnapshotFingerprint: string;
  summaryJson: unknown;
  status: string;
  createdAt: Date;
  confirmedAt: Date | null;
}): ChannelInitialSyncPreviewRecord {
  return {
    tenantId: record.tenantId,
    id: record.id,
    connectionId: record.connectionId,
    confirmationToken: record.confirmationToken,
    mappingConfigGeneration: record.mappingConfigGeneration,
    talosStateFingerprint: record.talosStateFingerprint,
    remoteSnapshotFingerprint: record.remoteSnapshotFingerprint,
    summary: record.summaryJson as Record<string, unknown>,
    status: record.status as ChannelInitialSyncPreviewStatus,
    createdAt: record.createdAt,
    confirmedAt: record.confirmedAt,
  };
}

export class PrismaChannelReconciliationRunRepository
  implements IChannelReconciliationRunRepository
{
  async save(run: ChannelReconciliationRunRecord): Promise<void> {
    await setTenantContext(prisma, run.tenantId);
    await prisma.channelReconciliationRun.create({
      data: {
        tenantId: run.tenantId,
        id: run.id,
        connectionId: run.connectionId,
        scope: run.scope,
        outcome: run.outcome,
        mappingConfigGeneration: run.mappingConfigGeneration,
        autoHealEnqueued: run.autoHealEnqueued,
        detailsJson: run.details as Prisma.InputJsonValue,
        completedAt: run.completedAt,
      },
    });
  }

  async listRecent(
    tenantId: string,
    connectionId: string,
    limit: number,
  ): Promise<readonly ChannelReconciliationRunRecord[]> {
    await setTenantContext(prisma, tenantId);
    const records = await prisma.channelReconciliationRun.findMany({
      where: { tenantId, connectionId },
      orderBy: { completedAt: "desc" },
      take: limit,
    });
    return records.map((r) => ({
      tenantId: r.tenantId,
      id: r.id,
      connectionId: r.connectionId,
      scope: r.scope as ChannelReconciliationRunRecord["scope"],
      outcome: r.outcome as ChannelReconciliationOutcomeCode,
      mappingConfigGeneration: r.mappingConfigGeneration,
      autoHealEnqueued: r.autoHealEnqueued,
      details: r.detailsJson as Record<string, unknown>,
      completedAt: r.completedAt,
    }));
  }
}
