import {
  ChannelProductMapping,
  type ChannelProductMappingKind,
} from "../domain/ChannelProductMapping";
import type {
  ChannelConnectionProviderSetupRecord,
  ChannelInitialSyncPreviewRecord,
  ChannelReconciliationRunRecord,
  IChannelConnectionProviderSetupRepository,
  IChannelInitialSyncPreviewRepository,
  IChannelProductMappingRepository,
  IChannelReconciliationRunRepository,
} from "../ports/IChannelProductMappingRepository";
import { createDefaultBookingComConnectionSetup } from "../providers/booking_com/setup/BookingComConnectionSetup";

function key(tenantId: string, id: string): string {
  return `${tenantId}\0${id}`;
}

export class InMemoryChannelProductMappingRepository
  implements IChannelProductMappingRepository
{
  private readonly store = new Map<string, ChannelProductMapping>();

  async findById(tenantId: string, id: string): Promise<ChannelProductMapping | null> {
    return this.store.get(key(tenantId, id)) ?? null;
  }

  async listByConnection(
    tenantId: string,
    connectionId: string,
  ): Promise<readonly ChannelProductMapping[]> {
    return [...this.store.values()].filter(
      (m) => m.tenantId === tenantId && m.connectionId === connectionId,
    );
  }

  async listActiveByConnectionAndKind(
    tenantId: string,
    connectionId: string,
    kind: ChannelProductMappingKind,
  ): Promise<readonly ChannelProductMapping[]> {
    return (await this.listByConnection(tenantId, connectionId)).filter(
      (m) => m.kind === kind && m.status === "active",
    );
  }

  async save(mapping: ChannelProductMapping): Promise<void> {
    this.store.set(key(mapping.tenantId, mapping.id), mapping);
  }
}

export class InMemoryChannelConnectionProviderSetupRepository
  implements IChannelConnectionProviderSetupRepository
{
  private readonly store = new Map<string, ChannelConnectionProviderSetupRecord>();

  async get(
    tenantId: string,
    connectionId: string,
  ): Promise<ChannelConnectionProviderSetupRecord | null> {
    return this.store.get(key(tenantId, connectionId)) ?? null;
  }

  async upsert(record: ChannelConnectionProviderSetupRecord): Promise<void> {
    this.store.set(key(record.tenantId, record.connectionId), { ...record });
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

export class InMemoryChannelInitialSyncPreviewRepository
  implements IChannelInitialSyncPreviewRepository
{
  private readonly store = new Map<string, ChannelInitialSyncPreviewRecord>();

  async save(preview: ChannelInitialSyncPreviewRecord): Promise<void> {
    this.store.set(key(preview.tenantId, preview.id), { ...preview });
  }

  async findById(
    tenantId: string,
    previewId: string,
  ): Promise<ChannelInitialSyncPreviewRecord | null> {
    return this.store.get(key(tenantId, previewId)) ?? null;
  }

  async findPendingByToken(
    tenantId: string,
    connectionId: string,
    confirmationToken: string,
  ): Promise<ChannelInitialSyncPreviewRecord | null> {
    return (
      [...this.store.values()].find(
        (p) =>
          p.tenantId === tenantId &&
          p.connectionId === connectionId &&
          p.confirmationToken === confirmationToken &&
          p.status === "pending",
      ) ?? null
    );
  }

  async markConfirmed(input: {
    tenantId: string;
    previewId: string;
    confirmedAt: Date;
  }): Promise<void> {
    const existing = await this.findById(input.tenantId, input.previewId);
    if (!existing) return;
    await this.save({
      ...existing,
      status: "confirmed",
      confirmedAt: input.confirmedAt,
    });
  }

  async supersedePending(
    tenantId: string,
    connectionId: string,
    exceptPreviewId?: string,
  ): Promise<void> {
    for (const preview of this.store.values()) {
      if (
        preview.tenantId === tenantId &&
        preview.connectionId === connectionId &&
        preview.status === "pending" &&
        preview.id !== exceptPreviewId
      ) {
        await this.save({ ...preview, status: "superseded" });
      }
    }
  }
}

export class InMemoryChannelReconciliationRunRepository
  implements IChannelReconciliationRunRepository
{
  private readonly runs: ChannelReconciliationRunRecord[] = [];

  async save(run: ChannelReconciliationRunRecord): Promise<void> {
    this.runs.push({ ...run });
  }

  async listRecent(
    tenantId: string,
    connectionId: string,
    limit: number,
  ): Promise<readonly ChannelReconciliationRunRecord[]> {
    return this.runs
      .filter((r) => r.tenantId === tenantId && r.connectionId === connectionId)
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())
      .slice(0, limit);
  }
}
