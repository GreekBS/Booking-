import type { IStorefrontIdempotencyRepository } from "@hcp/domain";
import { withTenantTransaction } from "../../client";

export class PrismaStorefrontIdempotencyRepository implements IStorefrontIdempotencyRepository {
  async findResourceId(
    tenantId: string,
    scope: "hold" | "booking",
    idempotencyKey: string,
  ): Promise<string | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.storefrontIdempotencyRecord.findUnique({
        where: {
          tenantId_scope_idempotencyKey: {
            tenantId,
            scope,
            idempotencyKey,
          },
        },
      });

      if (!record) {
        return null;
      }

      if (record.expiresAt.getTime() <= Date.now()) {
        return null;
      }

      return record.resourceId;
    });
  }

  async save(
    tenantId: string,
    scope: "hold" | "booking",
    idempotencyKey: string,
    resourceId: string,
    expiresAt: Date,
  ): Promise<void> {
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.storefrontIdempotencyRecord.upsert({
        where: {
          tenantId_scope_idempotencyKey: {
            tenantId,
            scope,
            idempotencyKey,
          },
        },
        create: {
          tenantId,
          scope,
          idempotencyKey,
          resourceId,
          expiresAt,
        },
        update: {
          resourceId,
          expiresAt,
        },
      });
    });
  }
}
