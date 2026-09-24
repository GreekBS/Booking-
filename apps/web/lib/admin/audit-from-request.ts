import type { NextRequest } from "next/server";
import type { AuditEntry } from "@hcp/domain";

export function auditFromRequest(
  request: NextRequest,
  actor: { tenantId: string; userId: string },
  action: string,
  resourceType: string,
  resourceId: string | null = null,
  metadata: Record<string, unknown> = {},
): AuditEntry {
  const forwarded = request.headers.get("x-forwarded-for");
  const ipAddress = forwarded?.split(",")[0]?.trim() ?? null;
  return {
    tenantId: actor.tenantId,
    actorId: actor.userId,
    action,
    resourceType,
    resourceId,
    metadata,
    ipAddress,
  };
}
