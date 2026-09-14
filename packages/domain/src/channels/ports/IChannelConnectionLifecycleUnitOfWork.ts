import type { IAuditLogRepository } from "../../shared/ports/InfrastructurePorts";
import type { IChannelConnectionRepository } from "./IChannelConnectionRepository";

/**
 * Application-owned transaction boundary for CM-4b S3e lifecycle activate/resume.
 *
 * The use case runs permission/policy/load/mutation outside the transaction, then
 * executes lifecycle CAS + audit inside exactly one interactive transaction.
 * Repository implementations must participate when given the transaction client
 * and must not open a nested transaction.
 */
export interface ChannelConnectionLifecycleTransactionPorts {
  connections: IChannelConnectionRepository;
  audit: IAuditLogRepository;
}

export interface IChannelConnectionLifecycleUnitOfWork {
  runInTransaction<T>(
    tenantId: string,
    work: (ports: ChannelConnectionLifecycleTransactionPorts) => Promise<T>,
  ): Promise<T>;
}
