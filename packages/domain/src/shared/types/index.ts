export type TenantStatus = "active" | "suspended" | "archived";

export type PlatformRole = "super_admin";

export type TenantRole = "admin" | "manager";

export type MembershipStatus = "active" | "invited" | "revoked";

export type PropertyType = "villa" | "apartment" | "hotel" | "other";

export type PropertyStatus = "draft" | "active" | "inactive" | "archived";

export type UnitStatus = "active" | "inactive" | "archived";

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: TenantRole | "super_admin";
  propertyIds: string[] | null;
}

export type { UseCaseAuditContext } from "./AuditContext";

export interface AuditEntry {
  tenantId: string | null;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
}

export interface OutboxEntry {
  id: string;
  tenantId: string | null;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: OutboxEventStatus;
  attemptCount: number;
}

export type OutboxEventStatus = "pending" | "processing" | "completed" | "dead_letter";

export type OutboxFailureDisposition = "retry" | "dead_letter";

export interface ProcessOutboxBatchResult {
  claimed: number;
  completed: number;
  retried: number;
  deadLettered: number;
}

export type BackgroundJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "dead_letter"
  | "cancelled";

export type JobFailureDisposition = "retry" | "dead_letter";

export interface BackgroundJobEntry {
  id: string;
  tenantId: string | null;
  jobType: string;
  payload: Record<string, unknown>;
  status: BackgroundJobStatus;
  priority: number;
  runAt: Date;
  idempotencyKey: string | null;
  attemptCount: number;
  maxAttempts: number;
  createdAt: Date;
}

export interface EnqueueJobCommand {
  tenantId?: string | null;
  jobType: string;
  payload: Record<string, unknown>;
  runAt?: Date;
  priority?: number;
  idempotencyKey?: string;
  maxAttempts?: number;
}

export interface ProcessJobBatchResult {
  claimed: number;
  completed: number;
  retried: number;
  deadLettered: number;
}

export interface ClaimJobBatchFilter {
  jobTypes?: string[];
}
