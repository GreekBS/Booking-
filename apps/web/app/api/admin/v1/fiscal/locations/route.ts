import { NextRequest } from "next/server";
import { requireTenantContext } from "@/lib/tenant-context";
import { apiError, apiSuccess } from "@/lib/api-error-handler";
import { greekFiscalLocationCatalogForOperator } from "@hcp/domain";

/** Read-only statutory Greek location catalog for operator configuration. */
export async function GET(request: NextRequest) {
  try {
    const tenantId = request.headers.get("x-tenant-id");
    await requireTenantContext(tenantId);
    const includeIslets =
      request.nextUrl.searchParams.get("includeIslets") === "1";
    const catalog = greekFiscalLocationCatalogForOperator().filter((row) => {
      if (includeIslets) return true;
      return row.kind !== "eligible_islet";
    });
    return apiSuccess({
      locations: catalog.map((row) => ({
        locationId: row.locationId,
        displayNameEl: row.displayNameEl,
        displayNameEn: row.displayNameEn,
        kind: row.kind,
        eligibleForReducedVat: row.eligibleForReducedVat,
        validFrom: row.validFrom,
        validUntil: row.validUntil,
        legalVersion: row.legalVersion,
      })),
    });
  } catch (error) {
    return apiError(error);
  }
}
