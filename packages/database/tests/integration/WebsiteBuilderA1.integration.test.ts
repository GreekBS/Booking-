/**
 * Website Builder A1 — schema / RLS / cross-tenant FK isolation.
 * Skips unless a safe integration DB is configured (see integrationGate).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import {
  clearTenantContext,
  prisma,
  verifyWebsiteBuilderRlsPoliciesActive,
  withTenantTransaction,
} from "./helpers";
import { runIntegration } from "./integrationGate";

const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const PROP_A = randomUUID();
const PROP_B = randomUUID();
const WEBSITE_A = randomUUID();
const VERSION_A = randomUUID();
const MEDIA_A = randomUUID();
const SLUG_A = `int-wb-a-${TENANT_A.slice(0, 8)}`;
const SLUG_B = `int-wb-b-${TENANT_B.slice(0, 8)}`;

runIntegration("Website Builder A1 foundation", () => {
  beforeAll(async () => {
    await clearTenantContext(prisma);
    await prisma.tenant.createMany({
      data: [
        { id: TENANT_A, name: "WB A1 Tenant A", slug: SLUG_A },
        { id: TENANT_B, name: "WB A1 Tenant B", slug: SLUG_B },
      ],
    });
    await withTenantTransaction(TENANT_A, async (tx) => {
      await tx.property.create({
        data: {
          id: PROP_A,
          tenantId: TENANT_A,
          name: "Villa A",
          slug: `villa-a-${PROP_A.slice(0, 6)}`,
          status: "active",
        },
      });
    });
    await withTenantTransaction(TENANT_B, async (tx) => {
      await tx.property.create({
        data: {
          id: PROP_B,
          tenantId: TENANT_B,
          name: "Villa B",
          slug: `villa-b-${PROP_B.slice(0, 6)}`,
          status: "active",
        },
      });
    });
  });

  afterAll(async () => {
    await clearTenantContext(prisma);
    for (const tenantId of [TENANT_A, TENANT_B]) {
      await withTenantTransaction(tenantId, async (tx) => {
        await tx.websiteMediaAsset.deleteMany({ where: { tenantId } });
        await tx.website.updateMany({
          where: { tenantId },
          data: { draftVersionId: null, publishedVersionId: null },
        });
        await tx.websiteVersion.deleteMany({ where: { tenantId } });
        await tx.website.deleteMany({ where: { tenantId } });
        await tx.property.deleteMany({ where: { tenantId } });
      });
    }
    await prisma.tenant.deleteMany({
      where: { id: { in: [TENANT_A, TENANT_B] } },
    });
    await prisma.$disconnect();
  });

  it("has FORCE RLS enabled on website builder tables", async () => {
    expect(await verifyWebsiteBuilderRlsPoliciesActive()).toBe(true);

    const forced = await prisma.$queryRaw<
      Array<{ relname: string; relforcerowsecurity: boolean }>
    >`
      SELECT c.relname, c.relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('websites', 'website_versions', 'website_media_assets')
    `;
    expect(forced).toHaveLength(3);
    expect(forced.every((r) => r.relforcerowsecurity === true)).toBe(true);
  });

  it("creates one website + draft version under tenant GUC", async () => {
    await withTenantTransaction(TENANT_A, async (tx) => {
      await tx.website.create({
        data: {
          id: WEBSITE_A,
          tenantId: TENANT_A,
          propertyId: PROP_A,
          status: "draft",
          themeId: "unset",
        },
      });
      await tx.websiteVersion.create({
        data: {
          id: VERSION_A,
          tenantId: TENANT_A,
          websiteId: WEBSITE_A,
          versionNumber: 1,
          locale: "el",
          sections: [],
          seo: {},
          state: "draft",
        },
      });
      await tx.website.update({
        where: { id: WEBSITE_A },
        data: { draftVersionId: VERSION_A },
      });
      await tx.websiteMediaAsset.create({
        data: {
          id: MEDIA_A,
          tenantId: TENANT_A,
          websiteId: WEBSITE_A,
          propertyId: PROP_A,
          storageKey: `wb-a1/${TENANT_A}/${MEDIA_A}.jpg`,
          contentType: "image/jpeg",
          sizeBytes: 1024,
          status: "pending",
        },
      });
    });

    const row = await withTenantTransaction(TENANT_A, async (tx) =>
      tx.website.findUnique({
        where: { id: WEBSITE_A },
        include: { versions: true, mediaAssets: true },
      }),
    );
    expect(row?.propertyId).toBe(PROP_A);
    expect(row?.draftVersionId).toBe(VERSION_A);
    expect(row?.versions).toHaveLength(1);
    expect(row?.mediaAssets).toHaveLength(1);
  });

  it("rejects a second website for the same property", async () => {
    await expect(
      withTenantTransaction(TENANT_A, async (tx) =>
        tx.website.create({
          data: {
            id: randomUUID(),
            tenantId: TENANT_A,
            propertyId: PROP_A,
            status: "draft",
            themeId: "unset",
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects cross-tenant property attachment via composite FK", async () => {
    await expect(
      withTenantTransaction(TENANT_A, async (tx) =>
        tx.website.create({
          data: {
            id: randomUUID(),
            tenantId: TENANT_A,
            propertyId: PROP_B, // belongs to TENANT_B
            status: "draft",
            themeId: "unset",
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("installs tenant isolation policies with USING + WITH CHECK", async () => {
    // Local hcp_test role is often superuser/BYPASSRLS, so SELECT filtering cannot
    // be relied on here. Catalog proof matches CleaningLocation RLS verification.
    const policies = await prisma.$queryRaw<
      Array<{ tablename: string; policyname: string; qual: string | null; with_check: string | null }>
    >`
      SELECT tablename, policyname, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('websites', 'website_versions', 'website_media_assets')
      ORDER BY tablename
    `;
    expect(policies).toHaveLength(3);
    for (const policy of policies) {
      expect(policy.qual).toContain("app.current_tenant");
      expect(policy.with_check).toContain("app.current_tenant");
    }
  });

  it("rejects cross-tenant website_version attachment", async () => {
    await expect(
      withTenantTransaction(TENANT_B, async (tx) =>
        tx.websiteVersion.create({
          data: {
            id: randomUUID(),
            tenantId: TENANT_B,
            websiteId: WEBSITE_A, // tenant A website
            versionNumber: 99, // avoid unique collision masking the FK failure
            locale: "el",
            sections: [],
            seo: {},
            state: "draft",
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
