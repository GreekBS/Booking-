import type {
  ChannelConnectionRedriveGate,
  ChannelConnectionStatus,
  IChannelConnectionStatusFinder,
} from "@hcp/domain";
import type { PrismaClient } from "@prisma/client";
import {
  prisma,
  withTenantTransaction,
  type PrismaTransactionClient,
} from "../../client";

type DbClient = PrismaClient | PrismaTransactionClient;

/**
 * P1-S6c / P1-S7c lifecycle + connection apply gate read model for async redrive.
 * Returns null when the connection no longer exists.
 */
export class PrismaChannelConnectionStatusFinder implements IChannelConnectionStatusFinder {
  constructor(private readonly client: DbClient = prisma) {}

  async findStatus(
    tenantId: string,
    connectionId: string,
  ): Promise<ChannelConnectionStatus | null> {
    const gate = await this.findRedriveGate(tenantId, connectionId);
    return gate?.status ?? null;
  }

  async findRedriveGate(
    tenantId: string,
    connectionId: string,
  ): Promise<ChannelConnectionRedriveGate | null> {
    return withTenantTransaction(tenantId, (tx) =>
      this.read(tx, tenantId, connectionId),
    );
  }

  private async read(
    tx: PrismaTransactionClient,
    tenantId: string,
    connectionId: string,
  ): Promise<ChannelConnectionRedriveGate | null> {
    const record = await tx.channelConnection.findUnique({
      where: { tenantId_id: { tenantId, id: connectionId } },
      select: { status: true, inventoryApplyEnabled: true },
    });
    if (!record) return null;
    return {
      status: record.status as ChannelConnectionStatus,
      inventoryApplyEnabled: record.inventoryApplyEnabled === true,
    };
  }
}
