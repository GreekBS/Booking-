import { NextRequest } from "next/server";
import { cleaningObjectStorage } from "@/lib/di/container";
import { requireTenantContext } from "@/lib/tenant-context";
import { apiSuccess, mapResultError } from "@/lib/api-error-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ADR-030 closure probe: reports which cleaning photo storage driver the
 * running process resolved. Never returns credentials or signed URLs.
 */
export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    await requireTenantContext(tenantId);

    const bucket =
      process.env.CLEANING_PHOTOS_BUCKET?.trim() || "cleaning-photos";

    return apiSuccess({
      data: {
        driver: cleaningObjectStorage.driver,
        bucket,
        hasSupabaseUrl: Boolean(process.env.SUPABASE_URL?.trim()),
        hasServiceRoleKey: Boolean(
          process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
        ),
        fsDriverForced:
          process.env.CLEANING_PHOTOS_DRIVER?.trim().toLowerCase() === "fs",
      },
    });
  } catch (error) {
    return mapResultError(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
