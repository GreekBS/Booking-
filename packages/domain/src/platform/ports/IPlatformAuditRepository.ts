import type { PlatformPage } from "./IPlatformOperationsRepository";

export interface PlatformAuditLogRow {
  id: string;
  createdAt: Date;
  action: string;
  resourceType: string;
  resourceId: string | null;
  tenantId: string | null;
  tenantName: string | null;
  actorId: string;
  actorName: string;
  actorEmail: string;
  ipAddress: string | null;
  /** Sanitized metadata safe for Super Admin UI rendering. */
  metadata: Record<string, unknown>;
}

export interface ListPlatformAuditLogsQuery {
  page: number;
  limit: number;
  action?: string;
  actorId?: string;
  tenantId?: string;
  /** Inclusive lower bound on createdAt. */
  from?: Date;
  /** Inclusive upper bound on createdAt. */
  to?: Date;
}

export interface PlatformSystemConfiguration {
  environment: "production" | "preview" | "development";
  nodeEnv: string;
  vercel: boolean;
  platformLabel: string;
  superAdminCount: number;
  tenantCount: number;
  hasMutablePlatformSettings: false;
}

/**
 * Platform Admin audit/system reads.
 * Authorization is the caller's responsibility (requireSuperAdmin).
 */
export interface IPlatformAuditRepository {
  listAuditLogs(
    query: ListPlatformAuditLogsQuery,
  ): Promise<PlatformPage<PlatformAuditLogRow>>;
  getSystemConfiguration(): Promise<PlatformSystemConfiguration>;
}
