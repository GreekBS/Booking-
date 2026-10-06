import { prisma } from "../../../client";
import type {
  IPublicCleaningQrLookup,
  PublicCleaningQrLookupRow,
} from "@hcp/domain";

type LookupSqlRow = {
  kind: string;
  qr_access_id: string;
  tenant_id: string;
  property_id: string;
  unit_id: string | null;
  cleaning_location_id: string | null;
};

/**
 * Public ACTIVE QR resolve via SECURITY DEFINER function.
 * Does not require tenant GUC (FORCE RLS safe).
 */
export class PrismaPublicCleaningQrLookup implements IPublicCleaningQrLookup {
  async findActiveByTokenHash(
    tokenHash: string,
  ): Promise<PublicCleaningQrLookupRow | null> {
    const normalized = tokenHash.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(normalized)) {
      return null;
    }

    const rows = await prisma.$queryRaw<LookupSqlRow[]>`
      SELECT * FROM public.lookup_active_cleaning_qr_by_token_hash(${normalized}::char(64))
    `;
    const row = rows[0];
    if (!row) return null;

    const kind = row.kind === "unit" ? "unit" : "location";
    return {
      kind,
      qrAccessId: row.qr_access_id,
      tenantId: row.tenant_id,
      propertyId: row.property_id,
      unitId: row.unit_id,
      cleaningLocationId: row.cleaning_location_id,
      tokenHash: normalized,
    };
  }
}
