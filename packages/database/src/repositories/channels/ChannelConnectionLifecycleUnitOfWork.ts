import type {
  IChannelConnectionLifecycleUnitOfWork,
  ChannelConnectionLifecycleTransactionPorts,
} from "@hcp/domain";
import type { PrismaClient } from "@prisma/client";
import {
  prisma,
  withTenantTransaction,
  type PrismaTransactionClient,
} from "../../client";
import { PrismaAuditLogRepository } from "../AuditLogRepository";
import { PrismaChannelConnectionRepository } from "./ChannelConnectionRepository";

type DbClient = PrismaClient | PrismaTransactionClient;

/** Optional Prisma interactive-transaction options (tests may raise timeout under remote latency). */
export type ChannelConnectionLifecycleTransactionOptions = {
  maxWait?: number;
  timeout?: number;
};

/**
 * PostgreSQL unit of work for CM-4b S3e lifecycle activate/resume.
 *
 * Opens one interactive transaction, sets tenant context, and supplies
 * TX-scoped connection + audit repositories (no nested transactions).
 */
export class PrismaChannelConnectionLifecycleUnitOfWork
  implements IChannelConnectionLifecycleUnitOfWork
{
  constructor(
    private readonly client: DbClient = prisma,
    /**
     * When unset, Prisma's default interactive-transaction timeout applies.
     * Production call sites must leave this unset; integration tests may raise it.
     */
    private readonly transactionOptions?: ChannelConnectionLifecycleTransactionOptions,
  ) {}

  async runInTransaction<T>(
    tenantId: string,
    work: (ports: ChannelConnectionLifecycleTransactionPorts) => Promise<T>,
  ): Promise<T> {
    return withTenantTransaction(
      tenantId,
      async (tx) => work(this.createPorts(tx)),
      this.transactionOptions,
    );
  }

  private createPorts(client: DbClient): ChannelConnectionLifecycleTransactionPorts {
    return {
      connections: new PrismaChannelConnectionRepository(client),
      audit: new PrismaAuditLogRepository(client),
    };
  }
}
