import type {
  IPlatformAuditRepository,
  ListPlatformAuditLogsQuery,
  PlatformAuditLogRow,
  PlatformPage,
  PlatformSystemConfiguration,
} from "@hcp/domain";
import { prisma } from "../client";
import type { Prisma } from "@prisma/client";

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|credential|authorization|api[_-]?key|cookie|session|hash|ciphertext|bearer)/i;

/** Sanitize audit metadata for Super Admin UI (redact secrets, truncate depth/size). */
export function sanitizeAuditMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeAuditMetadata(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = sanitizeAuditMetadata(child, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 500) {
    return `${value.slice(0, 500)}…`;
  }
  return value;
}

export class PrismaPlatformAuditRepository implements IPlatformAuditRepository {
  async listAuditLogs(
    query: ListPlatformAuditLogsQuery,
  ): Promise<PlatformPage<PlatformAuditLogRow>> {
    const page = Math.max(1, query.page);
    const limit = Math.min(100, Math.max(1, query.limit));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) {
      where.action = { contains: query.action, mode: "insensitive" };
    }
    if (query.actorId) where.actorId = query.actorId;
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = query.from;
      if (query.to) where.createdAt.lte = query.to;
    }

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          action: true,
          resourceType: true,
          resourceId: true,
          tenantId: true,
          actorId: true,
          ipAddress: true,
          metadata: true,
          actor: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    const tenantIds = [
      ...new Set(
        rows
          .map((r) => r.tenantId)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    const tenants = tenantIds.length
      ? await prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true },
        })
      : [];
    const tenantName = new Map(tenants.map((t) => [t.id, t.name]));

    const data: PlatformAuditLogRow[] = rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      tenantId: row.tenantId,
      tenantName: row.tenantId ? (tenantName.get(row.tenantId) ?? null) : null,
      actorId: row.actorId,
      actorName: row.actor.name,
      actorEmail: row.actor.email,
      ipAddress: row.ipAddress,
      metadata: sanitizeAuditMetadata(row.metadata) as Record<string, unknown>,
    }));

    return { data, total, page, limit };
  }

  async getSystemConfiguration(): Promise<PlatformSystemConfiguration> {
    const vercelEnv =
      process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? "";
    const environment =
      vercelEnv === "production" ||
      vercelEnv === "preview" ||
      vercelEnv === "development"
        ? vercelEnv
        : process.env.NODE_ENV === "production"
          ? "production"
          : "development";

    const [superAdminCount, tenantCount] = await Promise.all([
      prisma.user.count({ where: { platformRole: "super_admin" } }),
      prisma.tenant.count({ where: { deletedAt: null } }),
    ]);

    return {
      environment,
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      vercel: Boolean(process.env.VERCEL),
      platformLabel: "Talos Platform Control Center",
      superAdminCount,
      tenantCount,
      hasMutablePlatformSettings: false,
    };
  }
}
