import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PermissionChecker, type ActorContext } from "../src/shared/services/PermissionChecker";
import { Website } from "../src/website/domain/Website";
import { WebsiteVersion } from "../src/website/domain/WebsiteVersion";
import type {
  IWebsiteRepository,
  IWebsiteUnitOfWork,
  IWebsiteVersionRepository,
  PublishWebsiteSnapshot,
  SaveWebsiteDraftSnapshot,
} from "../src/website/ports/IWebsiteRepository";
import {
  EnsureWebsiteUseCase,
  GetWebsiteUseCase,
  PublishWebsiteUseCase,
  SaveWebsiteDraftUseCase,
} from "../src/website/application/WebsiteUseCases";
import { WEBSITE_CONTENT_SCHEMA_VERSION } from "@hcp/validators";

const TENANT = randomUUID();
const PROP = randomUUID();
const PROP_OTHER = randomUUID();

class MemoryIds {
  generate(): string {
    return randomUUID();
  }
}

function snapshotWebsite(website: Website) {
  return {
    id: website.id,
    tenantId: website.tenantId,
    propertyId: website.propertyId,
    status: website.status,
    themeId: website.themeId,
    contentSchemaVersion: website.contentSchemaVersion,
    draftVersionId: website.draftVersionId,
    publishedVersionId: website.publishedVersionId,
    createdAt: website.createdAt,
    updatedAt: website.updatedAt,
  };
}

function snapshotVersion(version: WebsiteVersion) {
  return {
    id: version.id,
    tenantId: version.tenantId,
    websiteId: version.websiteId,
    versionNumber: version.versionNumber,
    locale: version.locale,
    sections: structuredClone(version.sections),
    seo: structuredClone(version.seo),
    state: version.state,
    publishedAt: version.publishedAt,
    publishedBy: version.publishedBy,
    createdAt: version.createdAt,
  };
}

function makeRepos() {
  // Persist plain snapshots so failed UoW (no save) cannot leave dirty aggregates
  // in the store — mirrors transactional rollback for A3 adapters.
  const websites = new Map<string, ReturnType<typeof snapshotWebsite>>();
  const versions = new Map<string, ReturnType<typeof snapshotVersion>>();

  const websiteRepo: IWebsiteRepository = {
    async save(website) {
      const snap = snapshotWebsite(website);
      websites.set(`${snap.tenantId}:${snap.id}`, snap);
      websites.set(`prop:${snap.tenantId}:${snap.propertyId}`, snap);
    },
    async findById(tenantId, websiteId) {
      const snap = websites.get(`${tenantId}:${websiteId}`);
      return snap ? Website.reconstitute({ ...snap }) : null;
    },
    async findByPropertyId(tenantId, propertyId) {
      const snap = websites.get(`prop:${tenantId}:${propertyId}`);
      return snap ? Website.reconstitute({ ...snap }) : null;
    },
  };

  const versionRepo: IWebsiteVersionRepository = {
    async save(version) {
      const snap = snapshotVersion(version);
      versions.set(`${snap.tenantId}:${snap.id}`, snap);
    },
    async findById(tenantId, versionId) {
      const snap = versions.get(`${tenantId}:${versionId}`);
      return snap ? WebsiteVersion.reconstitute({ ...snap }) : null;
    },
    async findByWebsiteId(tenantId, websiteId) {
      return [...versions.values()]
        .filter((v) => v.tenantId === tenantId && v.websiteId === websiteId)
        .map((snap) => WebsiteVersion.reconstitute({ ...snap }));
    },
    async nextVersionNumber(tenantId, websiteId) {
      const list = await this.findByWebsiteId(tenantId, websiteId);
      return list.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;
    },
  };

  const unitOfWork: IWebsiteUnitOfWork = {
    async saveDraft(snapshot: SaveWebsiteDraftSnapshot) {
      await websiteRepo.save(snapshot.website);
      await versionRepo.save(snapshot.draft);
    },
    async publish(snapshot: PublishWebsiteSnapshot) {
      await websiteRepo.save(snapshot.website);
      await versionRepo.save(snapshot.published);
      if (snapshot.superseded) {
        await versionRepo.save(snapshot.superseded);
      }
      await versionRepo.save(snapshot.nextDraft);
    },
  };

  const properties = {
    async findById(tenantId: string, propertyId: string) {
      if (tenantId !== TENANT) return null;
      if (propertyId !== PROP && propertyId !== PROP_OTHER) return null;
      return {
        id: propertyId,
        tenantId,
        deletedAt: null,
        units: [],
      };
    },
  };

  return {
    websites: websiteRepo,
    versions: versionRepo,
    unitOfWork,
    properties: properties as never,
    ids: new MemoryIds(),
    checker: new PermissionChecker(),
  };
}

function admin(): ActorContext {
  return { userId: randomUUID(), role: "admin", propertyIds: null };
}

function manager(ids: string[]): ActorContext {
  return { userId: randomUUID(), role: "manager", propertyIds: ids };
}

describe("WebsiteUseCases", () => {
  it("ensures a website + draft for an authorized actor", async () => {
    const deps = makeRepos();
    const ensure = new EnsureWebsiteUseCase(
      deps.websites,
      deps.versions,
      deps.unitOfWork,
      deps.properties,
      deps.checker,
      deps.ids,
    );
    const result = await ensure.execute(
      { tenantId: TENANT, propertyId: PROP },
      admin(),
    );
    expect(result.isSuccess).toBe(true);
    const value = result.getValue();
    expect(value.website.propertyId).toBe(PROP);
    expect(value.draft.isDraft).toBe(true);
    expect(value.website.draftVersionId).toBe(value.draft.id);
  });

  it("forbids manager on unassigned property", async () => {
    const deps = makeRepos();
    const ensure = new EnsureWebsiteUseCase(
      deps.websites,
      deps.versions,
      deps.unitOfWork,
      deps.properties,
      deps.checker,
      deps.ids,
    );
    const result = await ensure.execute(
      { tenantId: TENANT, propertyId: PROP },
      manager([PROP_OTHER]),
    );
    expect(result.isFailure).toBe(true);
    expect(result.getError().name).toBe("ForbiddenError");
  });

  it("saves validated draft content and rejects unsafe payloads", async () => {
    const deps = makeRepos();
    const ensure = new EnsureWebsiteUseCase(
      deps.websites,
      deps.versions,
      deps.unitOfWork,
      deps.properties,
      deps.checker,
      deps.ids,
    );
    await ensure.execute({ tenantId: TENANT, propertyId: PROP }, admin());

    const save = new SaveWebsiteDraftUseCase(
      deps.websites,
      deps.versions,
      deps.unitOfWork,
      deps.checker,
      deps.ids,
    );

    const ok = await save.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        content: {
          contentSchemaVersion: WEBSITE_CONTENT_SCHEMA_VERSION,
          locale: "el",
          themeId: "luxury_villa",
          seo: { metaTitle: "Sea Villa" },
          sections: [
            {
              id: randomUUID(),
              type: "hero",
              sortOrder: 0,
              visible: true,
              headline: "Stay",
            },
          ],
        },
      },
      admin(),
    );
    expect(ok.isSuccess).toBe(true);
    expect(ok.getValue().website.themeId).toBe("luxury_villa");

    const bad = await save.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
        content: {
          contentSchemaVersion: WEBSITE_CONTENT_SCHEMA_VERSION,
          locale: "el",
          sections: [
            {
              id: randomUUID(),
              type: "hero",
              sortOrder: 0,
              visible: true,
              headline: "X",
              ctaUrl: "javascript:alert(1)",
            },
          ],
        },
      },
      admin(),
    );
    expect(bad.isFailure).toBe(true);
  });

  it("publishes draft and allocates a new draft for continued editing", async () => {
    const deps = makeRepos();
    const actor = admin();
    const ensure = new EnsureWebsiteUseCase(
      deps.websites,
      deps.versions,
      deps.unitOfWork,
      deps.properties,
      deps.checker,
      deps.ids,
    );
    await ensure.execute({ tenantId: TENANT, propertyId: PROP }, actor);

    const save = new SaveWebsiteDraftUseCase(
      deps.websites,
      deps.versions,
      deps.unitOfWork,
      deps.checker,
      deps.ids,
    );
    await save.execute(
      {
        tenantId: TENANT,
        propertyId: PROP,
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
              body: "Published body",
            },
          ],
        },
      },
      actor,
    );

    const publish = new PublishWebsiteUseCase(
      deps.websites,
      deps.versions,
      deps.unitOfWork,
      deps.checker,
      deps.ids,
    );
    const published = await publish.execute(
      { tenantId: TENANT, propertyId: PROP },
      actor,
    );
    expect(published.isSuccess).toBe(true);
    const value = published.getValue();
    expect(value.published.isPublished).toBe(true);
    expect(value.draft.isDraft).toBe(true);
    expect(value.draft.id).not.toBe(value.published.id);
    expect(value.website.publishedVersionId).toBe(value.published.id);
    expect(value.website.draftVersionId).toBe(value.draft.id);
    expect(value.website.status).toBe("published");

    const get = new GetWebsiteUseCase(
      deps.websites,
      deps.versions,
      deps.checker,
    );
    const loaded = await get.execute(
      { tenantId: TENANT, propertyId: PROP },
      actor,
    );
    expect(loaded.isSuccess).toBe(true);
    expect(loaded.getValue().published?.id).toBe(value.published.id);
  });

  it("rejects mutating a published version entity directly", () => {
    const version = WebsiteVersion.create({
      id: randomUUID(),
      tenantId: TENANT,
      websiteId: randomUUID(),
      versionNumber: 1,
      sections: [],
      seo: {},
    });
    version.markPublished(randomUUID());
    expect(() =>
      version.replaceDraftContent({ locale: "el", sections: [], seo: {} }),
    ).toThrow(/Only draft versions/);
  });

  it("does not persist when publish unit-of-work fails", async () => {
    const deps = makeRepos();
    const actor = admin();
    const ensure = new EnsureWebsiteUseCase(
      deps.websites,
      deps.versions,
      deps.unitOfWork,
      deps.properties,
      deps.checker,
      deps.ids,
    );
    await ensure.execute({ tenantId: TENANT, propertyId: PROP }, actor);

    const before = await deps.websites.findByPropertyId(TENANT, PROP);
    const beforeDraftId = before!.draftVersionId;
    const beforeStatus = before!.status;

    const failingUow: IWebsiteUnitOfWork = {
      saveDraft: deps.unitOfWork.saveDraft,
      async publish() {
        throw new Error("simulated_tx_failure");
      },
    };

    const publish = new PublishWebsiteUseCase(
      deps.websites,
      deps.versions,
      failingUow,
      deps.checker,
      deps.ids,
    );
    const result = await publish.execute(
      { tenantId: TENANT, propertyId: PROP },
      actor,
    );
    expect(result.isFailure).toBe(true);

    const after = await deps.websites.findByPropertyId(TENANT, PROP);
    expect(after!.status).toBe(beforeStatus);
    expect(after!.draftVersionId).toBe(beforeDraftId);
    expect(after!.publishedVersionId).toBeNull();
    const draft = await deps.versions.findById(TENANT, beforeDraftId!);
    expect(draft!.isDraft).toBe(true);
  });

  it("isolates websites by tenant id on read", async () => {
    const deps = makeRepos();
    await new EnsureWebsiteUseCase(
      deps.websites,
      deps.versions,
      deps.unitOfWork,
      deps.properties,
      deps.checker,
      deps.ids,
    ).execute({ tenantId: TENANT, propertyId: PROP }, admin());

    const get = new GetWebsiteUseCase(
      deps.websites,
      deps.versions,
      deps.checker,
    );
    const otherTenant = await get.execute(
      { tenantId: randomUUID(), propertyId: PROP },
      admin(),
    );
    expect(otherTenant.isFailure).toBe(true);
  });
});
