import {
  ConflictError,
  NotFoundError,
  type IWebsiteRepository,
  type IWebsiteUnitOfWork,
  type IWebsiteVersionRepository,
  type PublishWebsiteSnapshot,
  type SaveWebsiteDraftSnapshot,
  type Website,
  type WebsiteVersion,
} from "@hcp/domain";
import type { PrismaClient } from "@prisma/client";
import {
  prisma,
  withTenantTransaction,
  type PrismaTransactionClient,
} from "../../client";
import {
  mapWebsite,
  mapWebsiteVersion,
  websiteCreateData,
  websiteVersionCreateData,
} from "./websiteMappers";

type DbClient = PrismaClient | PrismaTransactionClient;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Persist a website row with optimistic concurrency on `updatedAt`.
 * Create path: insert. Update path: updateMany where expectedUpdatedAt matches.
 */
async function persistWebsite(tx: DbClient, website: Website): Promise<void> {
  const existing = await tx.website.findFirst({
    where: { id: website.id, tenantId: website.tenantId },
    select: { id: true },
  });

  if (!existing) {
    try {
      await tx.website.create({ data: websiteCreateData(website) });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          "Website already exists for this property or id",
          "website_create_conflict",
        );
      }
      throw error;
    }
    return;
  }

  const result = await tx.website.updateMany({
    where: {
      id: website.id,
      tenantId: website.tenantId,
      updatedAt: website.expectedUpdatedAt,
    },
    data: {
      status: website.status,
      themeId: website.themeId,
      contentSchemaVersion: website.contentSchemaVersion,
      draftVersionId: website.draftVersionId,
      publishedVersionId: website.publishedVersionId,
      updatedAt: website.updatedAt,
    },
  });

  if (result.count === 0) {
    const row = await tx.website.findFirst({
      where: { id: website.id, tenantId: website.tenantId },
      select: { id: true },
    });
    if (!row) {
      throw new NotFoundError("Website", website.id);
    }
    throw new ConflictError(
      "Website was modified concurrently; reload and retry",
      "website_updated_at_conflict",
    );
  }
}

async function persistVersion(tx: DbClient, version: WebsiteVersion): Promise<void> {
  const existing = await tx.websiteVersion.findFirst({
    where: { id: version.id, tenantId: version.tenantId },
    select: { id: true, state: true },
  });

  if (!existing) {
    try {
      await tx.websiteVersion.create({ data: websiteVersionCreateData(version) });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          "Website version number or id conflict",
          "website_version_conflict",
        );
      }
      throw error;
    }
    return;
  }

  if (existing.state !== "draft" && version.state === "draft") {
    throw new ConflictError(
      "Cannot write draft content onto a non-draft version",
      "website_version_immutable",
    );
  }

  // Published/superseded rows may only transition state metadata, never sections/seo
  // when already frozen — domain enforces; persistence double-checks draft edits.
  if (existing.state === "draft" && version.state === "draft") {
    const result = await tx.websiteVersion.updateMany({
      where: {
        id: version.id,
        tenantId: version.tenantId,
        state: "draft",
      },
      data: {
        locale: version.locale,
        sections: version.sections as object,
        seo: version.seo as object,
      },
    });
    if (result.count === 0) {
      throw new ConflictError(
        "Draft version is no longer editable",
        "website_version_immutable",
      );
    }
    return;
  }

  // draft → published or published → superseded
  const result = await tx.websiteVersion.updateMany({
    where: {
      id: version.id,
      tenantId: version.tenantId,
      state: existing.state,
    },
    data: {
      state: version.state,
      publishedAt: version.publishedAt,
      publishedBy: version.publishedBy,
      // Never rewrite sections/seo on non-draft transitions.
    },
  });
  if (result.count === 0) {
    throw new ConflictError(
      "Website version state changed concurrently",
      "website_version_state_conflict",
    );
  }
}

export class PrismaWebsiteRepository implements IWebsiteRepository {
  constructor(private readonly client: DbClient = prisma) {}

  async save(website: Website): Promise<void> {
    await withTenantTransaction(website.tenantId, async (tx) => {
      await persistWebsite(tx, website);
    });
    website.acknowledgePersisted();
  }

  async findById(tenantId: string, websiteId: string): Promise<Website | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.website.findFirst({
        where: { id: websiteId, tenantId },
      });
      return row ? mapWebsite(row) : null;
    });
  }

  async findByPropertyId(
    tenantId: string,
    propertyId: string,
  ): Promise<Website | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.website.findFirst({
        where: { tenantId, propertyId },
      });
      return row ? mapWebsite(row) : null;
    });
  }
}

export class PrismaWebsiteVersionRepository implements IWebsiteVersionRepository {
  constructor(private readonly client: DbClient = prisma) {}

  async save(version: WebsiteVersion): Promise<void> {
    await withTenantTransaction(version.tenantId, async (tx) => {
      await persistVersion(tx, version);
    });
  }

  async findById(
    tenantId: string,
    versionId: string,
  ): Promise<WebsiteVersion | null> {
    return withTenantTransaction(tenantId, async (tx) => {
      const row = await tx.websiteVersion.findFirst({
        where: { id: versionId, tenantId },
      });
      return row ? mapWebsiteVersion(row) : null;
    });
  }

  async findByWebsiteId(
    tenantId: string,
    websiteId: string,
  ): Promise<WebsiteVersion[]> {
    return withTenantTransaction(tenantId, async (tx) => {
      const rows = await tx.websiteVersion.findMany({
        where: { tenantId, websiteId },
        orderBy: { versionNumber: "asc" },
      });
      return rows.map(mapWebsiteVersion);
    });
  }

  async nextVersionNumber(tenantId: string, websiteId: string): Promise<number> {
    return withTenantTransaction(tenantId, async (tx) => {
      return nextVersionNumberInTx(tx, tenantId, websiteId);
    });
  }
}

async function nextVersionNumberInTx(
  tx: DbClient,
  tenantId: string,
  websiteId: string,
): Promise<number> {
  const agg = await tx.websiteVersion.aggregate({
    where: { tenantId, websiteId },
    _max: { versionNumber: true },
  });
  return (agg._max.versionNumber ?? 0) + 1;
}

export type WebsiteUnitOfWorkTransactionOptions = {
  maxWait?: number;
  timeout?: number;
};

/**
 * Atomic Website Builder writes. Locks the website row (FOR UPDATE) then
 * persists version + pointer updates in the same tenant transaction.
 */
export class PrismaWebsiteUnitOfWork implements IWebsiteUnitOfWork {
  constructor(
    private readonly transactionOptions?: WebsiteUnitOfWorkTransactionOptions,
  ) {}

  async saveDraft(snapshot: SaveWebsiteDraftSnapshot): Promise<void> {
    const { website, draft } = snapshot;
    if (draft.websiteId !== website.id || draft.tenantId !== website.tenantId) {
      throw new ConflictError(
        "Draft version does not belong to website",
        "website_version_ownership",
      );
    }

    await withTenantTransaction(
      website.tenantId,
      async (tx) => {
        const existing = await tx.website.findFirst({
          where: { id: website.id, tenantId: website.tenantId },
          select: { id: true },
        });

        if (!existing) {
          // FK order: website (null pointers) → version → website pointers.
          // Seed updatedAt with the concurrency token so the follow-up CAS update matches.
          try {
            await tx.website.create({
              data: {
                ...websiteCreateData(website),
                draftVersionId: null,
                publishedVersionId: null,
                updatedAt: website.expectedUpdatedAt,
              },
            });
          } catch (error) {
            if (isUniqueViolation(error)) {
              throw new ConflictError(
                "Website already exists for this property or id",
                "website_create_conflict",
              );
            }
            throw error;
          }
        } else {
          await lockWebsiteRow(tx, website.tenantId, website.id);
        }

        // New draft rows get versionNumber under the website lock (not pre-TX).
        const draftExists = await tx.websiteVersion.findFirst({
          where: { id: draft.id, tenantId: website.tenantId },
          select: { id: true },
        });
        if (!draftExists) {
          draft.assignVersionNumber(
            await nextVersionNumberInTx(tx, website.tenantId, website.id),
          );
        }

        await persistVersion(tx, draft);
        await persistWebsite(tx, website);
      },
      this.transactionOptions,
    );
    website.acknowledgePersisted();
  }

  async publish(snapshot: PublishWebsiteSnapshot): Promise<void> {
    const { website, published, superseded, nextDraft } = snapshot;
    await withTenantTransaction(
      website.tenantId,
      async (tx) => {
        const locked = await lockWebsiteRow(tx, website.tenantId, website.id);
        if (!locked) {
          throw new NotFoundError("Website", website.id);
        }

        for (const version of [published, nextDraft, superseded]) {
          if (!version) continue;
          if (
            version.websiteId !== website.id ||
            version.tenantId !== website.tenantId
          ) {
            throw new ConflictError(
              "Version does not belong to website",
              "website_version_ownership",
            );
          }
        }

        // Authoritative allocation after FOR UPDATE — closes the pre-TX race.
        nextDraft.assignVersionNumber(
          await nextVersionNumberInTx(tx, website.tenantId, website.id),
        );

        if (superseded) {
          await persistVersion(tx, superseded);
        }
        await persistVersion(tx, published);
        await persistVersion(tx, nextDraft);
        await persistWebsite(tx, website);
      },
      this.transactionOptions,
    );
    website.acknowledgePersisted();
  }
}

async function lockWebsiteRow(
  tx: DbClient,
  tenantId: string,
  websiteId: string,
): Promise<boolean> {
  // Serialize concurrent draft/publish on the same website.
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM websites
    WHERE id = ${websiteId}::uuid AND tenant_id = ${tenantId}::uuid
    FOR UPDATE
  `;
  return rows.length > 0;
}

/** TX-scoped repos for tests that already hold a tenant transaction. */
export function createWebsiteReposInTransaction(tx: PrismaTransactionClient): {
  websites: IWebsiteRepository;
  versions: IWebsiteVersionRepository;
} {
  return {
    websites: {
      save: async (website) => {
        await persistWebsite(tx, website);
        website.acknowledgePersisted();
      },
      findById: async (tenantId, websiteId) => {
        const row = await tx.website.findFirst({
          where: { id: websiteId, tenantId },
        });
        return row ? mapWebsite(row) : null;
      },
      findByPropertyId: async (tenantId, propertyId) => {
        const row = await tx.website.findFirst({
          where: { tenantId, propertyId },
        });
        return row ? mapWebsite(row) : null;
      },
    },
    versions: {
      save: async (version) => {
        await persistVersion(tx, version);
      },
      findById: async (tenantId, versionId) => {
        const row = await tx.websiteVersion.findFirst({
          where: { id: versionId, tenantId },
        });
        return row ? mapWebsiteVersion(row) : null;
      },
      findByWebsiteId: async (tenantId, websiteId) => {
        const rows = await tx.websiteVersion.findMany({
          where: { tenantId, websiteId },
          orderBy: { versionNumber: "asc" },
        });
        return rows.map(mapWebsiteVersion);
      },
      nextVersionNumber: async (tenantId, websiteId) =>
        nextVersionNumberInTx(tx, tenantId, websiteId),
    },
  };
}
