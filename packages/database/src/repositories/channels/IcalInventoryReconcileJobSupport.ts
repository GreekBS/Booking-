import type { BackgroundJobEntry } from "@hcp/domain";
import {
  RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
  type IIcalInventoryReconcileJobQuery,
  type IPendingIcalInventoryReconciliationReader,
  type PendingInventoryReconciliationRef,
} from "@hcp/domain";
import { prisma, setTenantContext } from "../../client";

export class PrismaPendingIcalInventoryReconciliationReader
  implements IPendingIcalInventoryReconciliationReader
{
  async listPending(limit: number): Promise<readonly PendingInventoryReconciliationRef[]> {
    const rows = await prisma.channelInventoryReconciliation.findMany({
      where: { reconcileStatus: "pending" },
      orderBy: [
        { tenantId: "asc" },
        { connectionId: "asc" },
        { cursorVersion: "asc" },
      ],
      take: limit,
    });
    return rows.map((row) => ({
      tenantId: row.tenantId,
      connectionId: row.connectionId,
      cursorVersion: row.cursorVersion,
      semanticConfigVersion: row.semanticConfigVersion,
      mappingId: row.mappingId,
      mappingVersion: row.mappingVersion,
    }));
  }

  async findPending(
    tenantId: string,
    connectionId: string,
    cursorVersion: number,
  ): Promise<PendingInventoryReconciliationRef | null> {
    await setTenantContext(prisma, tenantId);
    const row = await prisma.channelInventoryReconciliation.findUnique({
      where: {
        tenantId_connectionId_cursorVersion: {
          tenantId,
          connectionId,
          cursorVersion,
        },
      },
    });
    if (!row || row.reconcileStatus !== "pending") {
      return null;
    }
    return {
      tenantId: row.tenantId,
      connectionId: row.connectionId,
      cursorVersion: row.cursorVersion,
      semanticConfigVersion: row.semanticConfigVersion,
      mappingId: row.mappingId,
      mappingVersion: row.mappingVersion,
    };
  }
}

export class PrismaIcalInventoryReconcileJobQuery implements IIcalInventoryReconcileJobQuery {
  async listJobsForGeneration(params: {
    tenantId: string;
    connectionId: string;
    cursorVersion: number;
  }): Promise<readonly BackgroundJobEntry[]> {
    const rows = await prisma.backgroundJob.findMany({
      where: {
        jobType: RECONCILE_ICAL_IMPORTED_INVENTORY_JOB_TYPE,
        tenantId: params.tenantId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    return rows
      .filter((row) => {
        const payload = row.payload as Record<string, unknown>;
        return (
          payload.connectionId === params.connectionId &&
          payload.cursorVersion === params.cursorVersion
        );
      })
      .map((record) => ({
        id: record.id,
        tenantId: record.tenantId,
        jobType: record.jobType,
        payload: record.payload as Record<string, unknown>,
        status: record.status,
        priority: record.priority,
        runAt: record.runAt,
        idempotencyKey: record.idempotencyKey,
        attemptCount: record.attemptCount,
        maxAttempts: record.maxAttempts,
        createdAt: record.createdAt,
      }));
  }
}
