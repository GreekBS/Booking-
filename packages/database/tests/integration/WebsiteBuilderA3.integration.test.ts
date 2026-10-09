/**
 * Website Builder A3 — Prisma repos + atomic UoW on local TEST_DATABASE_URL.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  ConflictError,
  EnsureWebsiteUseCase,
  PermissionChecker,
  PublishWebsiteUseCase,
  SaveWebsiteDraftUseCase,
  WEBSITE_CONTENT_SCHEMA_VERSION,
  type ActorContext,
} from "@hcp/domain";
import {
  PrismaWebsiteRepository,
  PrismaWebsiteUnitOfWork,
  PrismaWebsiteVersionRepository,
} from "../../src/index";
import {
  clearTenantContext,
  prisma,
  withTenantTransaction,
} from "./helpers";
import { runIntegration } from "./integrationGate";

const TENANT = randomUUID();
const PROP = randomUUID();
const PROP_B = randomUUID();

class TestIds {
  generate(): string {
    return randomUUID();
  }
}

function admin(): ActorContext {
  return { userId: randomUUID(), role: "admin", propertyIds: null };
}

runIntegration("Website Builder A3 repositories", () => {
  const websites = new PrismaWebsiteRepository();
  const versions = new PrismaWebsiteVersionRepository();
  const unitOfWork = new PrismaWebsiteUnitOfWork();
  const checker = new PermissionChecker();
  const ids = new TestIds();

  const properties = {
    async findById(tenantId: string, propertyId: string) {
      return withTenantTransaction(tenantId, async (tx) => {
        const row = await tx.property.findFirst({
          where: { id: propertyId, tenantId },
        });
        if (!row) return null;
        return { id: row.id, tenantId: row.tenantId, deletedAt: row.deletedAt, units: [] };
      });
    },
  };

  beforeAll(async () => {
    await clearTenantContext(prisma);
    await prisma.tenant.create({
      data: {
        id: TENANT,
        name: "WB A3 Tenant",
        slug: `wba3-${TENANT.slice(0, 8)}`,
      },
    });
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.property.create({
        data: {
          id: PROP,
          tenantId: TENANT,
          name: "A3 Prop",
          slug: `a3-${PROP.slice(0, 6)}`,
          status: "active",
        },
      });
      await tx.property.create({
        data: {
          id: PROP_B,
          tenantId: TENANT,
          name: "A3 Prop B",
          slug: `a3b-${PROP_B.slice(0, 6)}`,
          status: "active",
        },
      });
    });
  });

  afterAll(async () => {
    await clearTenantContext(prisma);
    await withTenantTransaction(TENANT, async (tx) => {
      await tx.websiteMediaAsset.deleteMany({ where: { tenantId: TENANT } });
      await tx.website.updateMany({
        where: { tenantId: TENANT },
        data: { draftVersionId: null, publishedVersionId: null },
      });
      await tx.websiteVersion.deleteMany({ where: { tenantId: TENANT } });
      await tx.website.deleteMany({ where: { tenantId: TENANT } });
      await tx.property.deleteMany({ where: { tenantId: TENANT } });
    });
    await prisma.tenant.deleteMany({ where: { id: TENANT } });
    await prisma.$disconnect();
  });

  it("ensures website and saves draft content atomically", async () => {
    const ensure = new EnsureWebsiteUseCase(
      websites,
      versions,
      unitOfWork,
      properties as never,
      checker,
      ids,
    );
    const created = await ensure.execute(
      { tenantId: TENANT, propertyId: PROP },
      admin(),
    );
    expect(created.isSuccess).toBe(true);

    const save = new SaveWebsiteDraftUseCase(
      websites,
      versions,
      unitOfWork,
      checker,
      ids,
    );
    const sectionId = randomUUID();
    const saved = await save.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        content: {
          contentSchemaVersion: WEBSITE_CONTENT_SCHEMA_VERSION,
          locale: "el",
          themeId: "luxury_villa",
          seo: { metaTitle: "A3 Villa" },
          sections: [
            {
              id: sectionId,
              type: "hero",
              sortOrder: 0,
              visible: true,
              headline: "Hello",
            },
          ],
        },
      },
      admin(),
    );
    expect(saved.isSuccess).toBe(true);
    expect(saved.getValue().website.themeId).toBe("luxury_villa");

    const loaded = await websites.findByPropertyId(TENANT, PROP);
    expect(loaded?.themeId).toBe("luxury_villa");
    const draft = await versions.findById(TENANT, loaded!.draftVersionId!);
    expect(draft?.isDraft).toBe(true);
    expect(JSON.stringify(draft?.sections)).toContain("Hello");
  });

  it("rolls back draft save when website CAS fails mid-transaction", async () => {
    const site = await websites.findByPropertyId(TENANT, PROP);
    expect(site).not.toBeNull();
    const draft = await versions.findById(TENANT, site!.draftVersionId!);
    expect(draft).not.toBeNull();
    const beforeSections = JSON.stringify(draft!.sections);

    // Bump website.updatedAt under another load so `site` is stale.
    const other = await websites.findByPropertyId(TENANT, PROP);
    other!.setTheme("nature_retreat");
    await websites.save(other!);

    draft!.replaceDraftContent({
      locale: "el",
      sections: [
        {
          id: randomUUID(),
          type: "richtext",
          sortOrder: 0,
          visible: true,
          body: "SHOULD_NOT_PERSIST",
        },
      ],
      seo: {},
    });
    site!.setTheme("luxury_villa");

    await expect(
      unitOfWork.saveDraft({ website: site!, draft: draft! }),
    ).rejects.toBeInstanceOf(ConflictError);

    const afterDraft = await versions.findById(TENANT, site!.draftVersionId!);
    expect(JSON.stringify(afterDraft!.sections)).toBe(beforeSections);
    expect(JSON.stringify(afterDraft!.sections)).not.toContain(
      "SHOULD_NOT_PERSIST",
    );
  });

  it("publishes atomically and keeps published version immutable", async () => {
    const publish = new PublishWebsiteUseCase(
      websites,
      versions,
      unitOfWork,
      checker,
      ids,
    );
    const result = await publish.execute(
      { tenantId: TENANT, propertyId: PROP },
      admin(),
    );
    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.published.isPublished).toBe(true);
    expect(value.draft.isDraft).toBe(true);
    expect(value.draft.id).not.toBe(value.published.id);

    expect(() =>
      value.published.replaceDraftContent({
        locale: "el",
        sections: [],
        seo: {},
      }),
    ).toThrow(/Only draft versions/);

    const publishedRow = await versions.findById(TENANT, value.published.id);
    expect(publishedRow?.state).toBe("published");
    expect(publishedRow?.sections).toEqual(value.published.sections);
  });

  it("isolates websites by tenant on repository reads", async () => {
    const otherTenant = randomUUID();
    const found = await websites.findByPropertyId(otherTenant, PROP);
    expect(found).toBeNull();
  });

  it("rejects concurrent website updates via updatedAt CAS", async () => {
    const a = await websites.findByPropertyId(TENANT, PROP);
    const b = await websites.findByPropertyId(TENANT, PROP);
    expect(a && b).toBeTruthy();

    a!.setTheme("boutique_hotel");
    await websites.save(a!);

    b!.setTheme("nature_retreat");
    await expect(websites.save(b!)).rejects.toBeInstanceOf(ConflictError);

    const latest = await websites.findByPropertyId(TENANT, PROP);
    expect(latest!.themeId).toBe("boutique_hotel");
  });

  it("allocates unique version numbers under lock across concurrent publishes", async () => {
    // Fresh property so we control publish races independently of earlier tests.
    const prop = PROP_B;
    const ensure = new EnsureWebsiteUseCase(
      websites,
      versions,
      unitOfWork,
      properties as never,
      checker,
      ids,
    );
    await ensure.execute({ tenantId: TENANT, propertyId: prop }, admin());

    const save = new SaveWebsiteDraftUseCase(
      websites,
      versions,
      unitOfWork,
      checker,
      ids,
    );
    await save.execute(
      {
        tenantId: TENANT,
        propertyId: prop,
        content: {
          contentSchemaVersion: WEBSITE_CONTENT_SCHEMA_VERSION,
          locale: "el",
          themeId: "unset",
          seo: {},
          sections: [
            {
              id: randomUUID(),
              type: "richtext",
              sortOrder: 0,
              visible: true,
              body: "race",
            },
          ],
        },
      },
      admin(),
    );

    const publish = new PublishWebsiteUseCase(
      websites,
      versions,
      unitOfWork,
      checker,
      ids,
    );
    const actor = admin();
    // Overlapping publishes: loser hits CAS / immutable draft; winner commits.
    // If one runs fully after the other, both may succeed as sequential publishes —
    // either way version numbers must stay unique and only one row is `published`.
    await Promise.all([
      publish.execute({ tenantId: TENANT, propertyId: prop }, actor),
      publish.execute({ tenantId: TENANT, propertyId: prop }, actor),
    ]);

    const site = await websites.findByPropertyId(TENANT, prop);
    const all = await versions.findByWebsiteId(TENANT, site!.id);
    const numbers = all.map((v) => v.versionNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(all.filter((v) => v.state === "published")).toHaveLength(1);
    expect(site!.publishedVersionId).toBeTruthy();
    expect(site!.draftVersionId).toBeTruthy();
    expect(site!.draftVersionId).not.toBe(site!.publishedVersionId);
  });
});
