import type {
  AuditEntry,
  OutboxEntry,
  OutboxFailureDisposition,
} from "../types/index";
import type { DomainEvent } from "../kernel/DomainEvent";

export interface IAuditLogRepository {
  append(entry: AuditEntry): Promise<void>;
}

export interface IOutboxRepository {
  saveEvents(events: DomainEvent[]): Promise<void>;
  findUnprocessed(limit: number): Promise<OutboxEntry[]>;
  claimBatch(limit: number): Promise<OutboxEntry[]>;
  markProcessed(ids: string[]): Promise<void>;
  markCompleted(id: string): Promise<void>;
  markFailed(
    id: string,
    error: string,
    maxAttempts: number,
  ): Promise<OutboxFailureDisposition>;
}

export interface IUnitOfWork {
  execute<T>(fn: () => Promise<T>): Promise<T>;
}
