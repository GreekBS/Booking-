import type {
  EligibleBookingComRetrievalConnection,
  IEligibleBookingComRetrievalConnectionReader,
} from "@hcp/domain";
import { prisma } from "../../client";

/**
 * Lists active Booking.com connections with credentials (CM-4c-2).
 * Multi-tenant internal scheduler read — no tenant RLS session.
 */
export class PrismaEligibleBookingComRetrievalConnectionReader
  implements IEligibleBookingComRetrievalConnectionReader
{
  async listEligible(
    limit = 500,
  ): Promise<readonly EligibleBookingComRetrievalConnection[]> {
    const rows = await prisma.$queryRaw<
      Array<{ tenant_id: string; connection_id: string }>
    >`
      SELECT
        c."tenant_id",
        c."id" AS "connection_id"
      FROM "channel_connections" c
      WHERE c."provider" = 'booking_com'
        AND c."status" = 'active'::"ChannelConnectionStatus"
        AND c."credential_ref" IS NOT NULL
      ORDER BY c."tenant_id" ASC, c."id" ASC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      tenantId: row.tenant_id,
      connectionId: row.connection_id,
    }));
  }
}
