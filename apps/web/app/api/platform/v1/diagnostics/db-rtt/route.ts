/**
 * TEMPORARY Production DB RTT diagnostic — REMOVE after region canary.
 * Super Admin only (DB-authoritative). READ-ONLY timings. No row payloads.
 */
import { requireSuperAdmin } from "@/lib/tenant-context";
import { measureDbRtt } from "@/lib/diagnostics/measure-db-rtt";
import { apiError, apiSuccess } from "@/lib/api-error-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const actor = await requireSuperAdmin();
    const data = await measureDbRtt({
      userId: actor.userId,
      activeTenantId: actor.activeTenantId,
    });
    return apiSuccess(data);
  } catch (error) {
    return apiError(error);
  }
}
