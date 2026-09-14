import type { AuditEntry } from "../../shared/types/index";
import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type {
  ChannelConnectionLifecycleTransactionPorts,
  IChannelConnectionLifecycleUnitOfWork,
} from "../ports/IChannelConnectionLifecycleUnitOfWork";
import type { InMemoryChannelConnectionRepository } from "./InMemoryChannelConnectionRepository";

/**
 * In-memory audit log with deep-clone snapshot support for S3e TX parity.
 */
export class InMemoryLifecycleAuditLog implements IAuditLogRepository {
  readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push({
      ...entry,
      metadata: { ...entry.metadata },
    });
  }

  clear(): void {
    this.entries.length = 0;
  }

  exportSnapshot(): AuditEntry[] {
    return this.entries.map((entry) => ({
      ...entry,
      metadata: { ...entry.metadata },
    }));
  }

  restoreSnapshot(snapshot: AuditEntry[]): void {
    this.entries.length = 0;
    for (const entry of snapshot) {
      this.entries.push({
        ...entry,
        metadata: { ...entry.metadata },
      });
    }
  }
}

/**
 * Logical in-memory parity for S3e application-owned lifecycle transactions.
 * Snapshots connection store + audit entries; restores both on failure.
 * Transactions are serialized so concurrent callers get CAS winner/loser
 * parity without shallow-reference corruption from overlapping snapshots.
 */
export class InMemoryChannelConnectionLifecycleUnitOfWork
  implements IChannelConnectionLifecycleUnitOfWork
{
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly connections: InMemoryChannelConnectionRepository,
    private readonly audit: InMemoryLifecycleAuditLog,
  ) {}

  async runInTransaction<T>(
    _tenantId: string,
    work: (ports: ChannelConnectionLifecycleTransactionPorts) => Promise<T>,
  ): Promise<T> {
    const run = async (): Promise<T> => {
      const connectionSnapshot = this.connections.exportStoreSnapshot();
      const auditSnapshot = this.audit.exportSnapshot();

      try {
        return await work({
          connections: this.connections,
          audit: this.audit,
        });
      } catch (error) {
        this.connections.restoreStoreSnapshot(connectionSnapshot);
        this.audit.restoreSnapshot(auditSnapshot);
        throw error;
      }
    };

    const result = this.chain.then(run, run);
    this.chain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
