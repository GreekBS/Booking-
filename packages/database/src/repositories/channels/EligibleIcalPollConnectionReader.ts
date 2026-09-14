import type {
  EligibleIcalPollConnection,
  IEligibleIcalPollConnectionReader,
} from "@hcp/domain";
import { prisma } from "../../client";

/**
 * Lists active iCal availability_block_feed connections with credential + exactly one active mapping.
 * Multi-tenant internal scheduler read (no tenant RLS session).
 */
export class PrismaEligibleIcalPollConnectionReader
  implements IEligibleIcalPollConnectionReader
{
  async listEligible(limit = 500): Promise<readonly EligibleIcalPollConnection[]> {
    const rows = await prisma.$queryRaw<
      Array<{ tenant_id: string; connection_id: string }>
    >`
      SELECT
        c."tenant_id",
        c."id" AS "connection_id"
      FROM "channel_connections" c
      WHERE c."provider" = 'ical'
        AND c."status" = 'active'::"ChannelConnectionStatus"
        AND c."semantic_mode" = 'availability_block_feed'::"ChannelFeedSemanticMode"
        AND c."credential_ref" IS NOT NULL
        AND (
          SELECT COUNT(*)::int
          FROM "channel_listing_mappings" m
          WHERE m."tenant_id" = c."tenant_id"
            AND m."connection_id" = c."id"
            AND m."status" = 'active'::"ChannelListingMappingStatus"
        ) = 1
      ORDER BY c."tenant_id" ASC, c."id" ASC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      tenantId: row.tenant_id,
      connectionId: row.connection_id,
    }));
  }
}
