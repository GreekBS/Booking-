import { randomBytes } from "node:crypto";
import type {
  CreatePublishableKeyResult,
  IPublishableKeyRepository,
  PublishableKeyListItem,
  PublishableKeyRecord,
} from "@hcp/domain";
import { hashToken } from "../IdentityRepositories";
import { prisma, withTenantTransaction } from "../../client";

export class PrismaPublishableKeyRepository implements IPublishableKeyRepository {
  async findByKeyHash(keyHash: string): Promise<PublishableKeyRecord | null> {
    const record = await prisma.tenantPublishableKey.findFirst({
      where: { keyHash, isActive: true },
      select: {
        id: true,
        tenantId: true,
        environment: true,
        allowedDomains: true,
      },
    });

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      tenantId: record.tenantId,
      environment: record.environment,
      allowedDomains: record.allowedDomains,
    };
  }

  async listByTenant(tenantId: string): Promise<PublishableKeyListItem[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const records = await tx.tenantPublishableKey.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      });

      return records.map(mapListItem);
    });
  }

  async create(params: {
    id: string;
    tenantId: string;
    rawKey: string;
    environment: PublishableKeyRecord["environment"];
    allowedDomains: string[];
  }): Promise<CreatePublishableKeyResult> {
    await withTenantTransaction(params.tenantId, async (tx) => {
      await tx.tenantPublishableKey.create({
        data: {
          id: params.id,
          tenantId: params.tenantId,
          keyHash: hashToken(params.rawKey),
          keyPrefix: params.rawKey.slice(0, 16),
          environment: params.environment,
          allowedDomains: params.allowedDomains,
        },
      });
    });

    return {
      id: params.id,
      publishableKey: params.rawKey,
      environment: params.environment,
      allowedDomains: params.allowedDomains,
    };
  }

  async revoke(id: string, tenantId: string): Promise<void> {
    await withTenantTransaction(tenantId, async (tx) => {
      await tx.tenantPublishableKey.updateMany({
        where: { id, tenantId, isActive: true },
        data: { isActive: false },
      });
    });
  }

  async updateAllowedDomains(
    id: string,
    tenantId: string,
    allowedDomains: string[],
  ): Promise<PublishableKeyListItem> {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.tenantPublishableKey.update({
        where: { id, tenantId },
        data: { allowedDomains },
      });

      return mapListItem(record);
    });
  }

  async findById(id: string, tenantId: string): Promise<PublishableKeyListItem | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const record = await tx.tenantPublishableKey.findFirst({
        where: { id, tenantId },
      });
      return record ? mapListItem(record) : null;
    });
  }
}

function mapListItem(record: {
  id: string;
  keyPrefix: string;
  environment: PublishableKeyRecord["environment"];
  allowedDomains: string[];
  isActive: boolean;
  createdAt: Date;
}): PublishableKeyListItem {
  return {
    id: record.id,
    keyPrefix: record.keyPrefix,
    environment: record.environment,
    allowedDomains: record.allowedDomains,
    isActive: record.isActive,
    createdAt: record.createdAt,
  };
}

export async function insertPublishableKey(params: {
  id: string;
  tenantId: string;
  rawKey: string;
  environment: PublishableKeyRecord["environment"];
  allowedDomains: string[];
}): Promise<void> {
  await withTenantTransaction(params.tenantId, async (tx) => {
    await tx.tenantPublishableKey.create({
      data: {
        id: params.id,
        tenantId: params.tenantId,
        keyHash: hashToken(params.rawKey),
        keyPrefix: params.rawKey.slice(0, 16),
        environment: params.environment,
        allowedDomains: params.allowedDomains,
      },
    });
  });
}

export function generatePublishableKey(
  environment: PublishableKeyRecord["environment"],
): { rawKey: string; keyHash: string } {
  const suffix = randomBytes(18).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 24);
  const rawKey = `pk_${environment}_${suffix}`;
  return { rawKey, keyHash: hashToken(rawKey) };
}
