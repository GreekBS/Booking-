import {
  RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
  type ChannelReconcileJobHealthRow,
  type ChannelReconciliationHealthSummary,
  type IChannelConnectionHealthQuery,
} from "@hcp/domain";
import { prisma, withTenantTransaction } from "../../client";

export class PrismaChannelConnectionHealthQuery implements IChannelConnectionHealthQuery {
  async getReconciliationSummary(params: {
    tenantId: string;
    connectionId: string;
  }): Promise<ChannelReconciliationHealthSummary> {
    return withTenantTransaction(params.tenantId, async (tx) => {
      const [latest, pendingCount] = await Promise.all([
        tx.channelInventoryReconciliation.findFirst({
          where: {
            tenantId: params.tenantId,
            connectionId: params.connectionId,
          },
          orderBy: [{ cursorVersion: "desc" }],
        }),
        tx.channelInventoryReconciliation.count({
          where: {
            tenantId: params.tenantId,
            connectionId: params.connectionId,
            reconcileStatus: "pending",
          },
        }),
      ]);

      return {
        latest: latest
          ? {
              cursorVersion: latest.cursorVersion,
              status: latest.reconcileStatus,
              appliedAt: latest.appliedAt,
              errorCode: latest.reconcileErrorCode,
              completeObservedEvidence: latest.completeObservedEvidence,
            }
          : null,
        pendingCount,
      };
    });
  }

  async findLatestReconcileJob(params: {
    tenantId: string;
    connectionId: string;
  }): Promise<ChannelReconcileJobHealthRow | null> {
    const rows = await prisma.backgroundJob.findMany({
      where: {
        jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
        tenantId: params.tenantId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
    });
    const match = rows.find((row) => {
      const payload = row.payload as Record<string, unknown>;
      return payload.connectionId === params.connectionId;
    });
    if (!match) return null;
    return {
      id: match.id,
      status: match.status,
      attemptCount: match.attemptCount,
      runAt: match.runAt,
      nextRetryAt: match.nextRetryAt,
      completedAt: match.completedAt,
    };
  }

  async countActiveChannelImports(params: {
    tenantId: string;
    connectionId: string;
  }): Promise<number> {
    return withTenantTransaction(params.tenantId, async (tx) => {
      return tx.unitCalendarBlock.count({
        where: {
          tenantId: params.tenantId,
          connectionId: params.connectionId,
          blockType: "channel_import",
          status: "active",
        },
      });
    });
  }
}
