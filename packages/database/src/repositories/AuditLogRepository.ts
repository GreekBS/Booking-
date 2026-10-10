import type { IAuditLogRepository, AuditEntry } from "@hcp/domain";
import {
  getTenantTransaction,
  prisma,
  type PrismaTransactionClient,
} from "../client";
import type { Prisma, PrismaClient } from "@prisma/client";

type AuditDatabaseClient = PrismaClient | PrismaTransactionClient;

export class PrismaAuditLogRepository implements IAuditLogRepository {
  constructor(private readonly client: AuditDatabaseClient = prisma) {}

  async append(entry: AuditEntry): Promise<void> {
    // Join ambient withTenantTransaction when present (C3-H2c bulk apply).
    const client = getTenantTransaction() ?? this.client;
    await client.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actorId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        metadata: entry.metadata as Prisma.InputJsonValue,
        ipAddress: entry.ipAddress,
      },
    });
  }
}
