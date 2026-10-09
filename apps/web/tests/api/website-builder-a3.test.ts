import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  ForbiddenError,
  NotFoundError,
  Result,
  UnauthorizedError,
  ValidationError,
  Website,
  WebsiteVersion,
} from "@hcp/domain";

const requireTenantContext = vi.fn();
const toPermissionActor = vi.fn((actor: unknown) => actor);
const getExecute = vi.fn();
const ensureExecute = vi.fn();
const saveDraftExecute = vi.fn();
const updateThemeExecute = vi.fn();

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: (...args: unknown[]) => requireTenantContext(...args),
  toPermissionActor: (...args: unknown[]) => toPermissionActor(...args),
}));

vi.mock("@/lib/di/container", () => ({
  getWebsiteUseCase: { execute: (...args: unknown[]) => getExecute(...args) },
  ensureWebsiteUseCase: {
    execute: (...args: unknown[]) => ensureExecute(...args),
  },
  saveWebsiteDraftUseCase: {
    execute: (...args: unknown[]) => saveDraftExecute(...args),
  },
  updateWebsiteThemeUseCase: {
    execute: (...args: unknown[]) => updateThemeExecute(...args),
  },
}));

import {
  GET as getWebsite,
  POST as ensureWebsite,
} from "@/app/api/admin/v1/properties/[propertyId]/website/route";
import {
  GET as getDraft,
  PUT as putDraft,
} from "@/app/api/admin/v1/properties/[propertyId]/website/draft/route";
import { PATCH as patchTheme } from "@/app/api/admin/v1/properties/[propertyId]/website/theme/route";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PROP = "22222222-2222-4222-8222-222222222222";

const actor = {
  userId: "user-1",
  tenantId: TENANT,
  role: "admin" as const,
  propertyIds: null,
};

function websiteFixture() {
  return Website.create({
    id: "33333333-3333-4333-8333-333333333333",
    tenantId: TENANT,
    propertyId: PROP,
    themeId: "unset",
  });
}

function draftFixture(websiteId: string) {
  return WebsiteVersion.create({
    id: "44444444-4444-4444-8444-444444444444",
    tenantId: TENANT,
    websiteId,
    versionNumber: 1,
    sections: [],
    seo: {},
  });
}

function req(method: string, body?: unknown, tenantHeader = TENANT) {
  return new NextRequest(`http://localhost/api/admin/v1/properties/${PROP}/website`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-tenant-id": tenantHeader,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("Website Builder A3 admin APIs", () => {
  beforeEach(() => {
    requireTenantContext.mockReset().mockResolvedValue(actor);
    toPermissionActor.mockClear();
    getExecute.mockReset();
    ensureExecute.mockReset();
    saveDraftExecute.mockReset();
    updateThemeExecute.mockReset();
  });

  it("GET uses session tenantId and returns JSON website payload", async () => {
    const website = websiteFixture();
    const draft = draftFixture(website.id);
    website.pointDraftVersion(draft.id);
    getExecute.mockResolvedValue(Result.ok({ website, draft, published: null }));

    const res = await getWebsite(req("GET"), {
      params: Promise.resolve({ propertyId: PROP }),
    });
    expect(res.status).toBe(200);
    expect(requireTenantContext).toHaveBeenCalledWith(TENANT);
    expect(getExecute).toHaveBeenCalledWith(
      { tenantId: TENANT, propertyId: PROP },
      actor,
    );
    const json = await res.json();
    expect(json.website.propertyId).toBe(PROP);
    expect(json.draft.sections).toEqual([]);
    // No HTML rendering keys
    expect(json).not.toHaveProperty("html");
  });

  it("POST ensure rejects unauthenticated callers", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());
    const res = await ensureWebsite(req("POST", {}), {
      params: Promise.resolve({ propertyId: PROP }),
    });
    expect(res.status).toBe(401);
  });

  it("PUT draft validates body and rejects unsupported theme", async () => {
    const res = await putDraft(
      req("PUT", {
        contentSchemaVersion: 1,
        locale: "el",
        themeId: "neon_disco",
        sections: [],
        seo: {},
      }),
      { params: Promise.resolve({ propertyId: PROP }) },
    );
    expect(res.status).toBe(400);
    expect(saveDraftExecute).not.toHaveBeenCalled();
  });

  it("PUT draft rejects unsafe javascript URLs", async () => {
    const res = await putDraft(
      req("PUT", {
        contentSchemaVersion: 1,
        locale: "el",
        themeId: "unset",
        sections: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            type: "hero",
            sortOrder: 0,
            visible: true,
            headline: "X",
            ctaUrl: "javascript:alert(1)",
          },
        ],
        seo: {},
      }),
      { params: Promise.resolve({ propertyId: PROP }) },
    );
    expect(res.status).toBe(400);
    expect(saveDraftExecute).not.toHaveBeenCalled();
  });

  it("PUT draft forwards validated content with session tenant", async () => {
    const website = websiteFixture();
    const draft = draftFixture(website.id);
    saveDraftExecute.mockResolvedValue(Result.ok({ website, draft }));

    const body = {
      contentSchemaVersion: 1,
      locale: "el",
      themeId: "apartments_studios",
      sections: [],
      seo: { metaTitle: "Studios" },
    };
    const res = await putDraft(req("PUT", body), {
      params: Promise.resolve({ propertyId: PROP }),
    });
    expect(res.status).toBe(200);
    expect(saveDraftExecute).toHaveBeenCalledWith(
      { tenantId: TENANT, propertyId: PROP, content: expect.objectContaining({ themeId: "apartments_studios" }) },
      actor,
    );
  });

  it("PATCH theme maps ForbiddenError", async () => {
    updateThemeExecute.mockResolvedValue(Result.fail(new ForbiddenError()));
    const res = await patchTheme(
      req("PATCH", { themeId: "nature_retreat" }),
      { params: Promise.resolve({ propertyId: PROP }) },
    );
    expect(res.status).toBe(403);
  });

  it("GET draft maps NotFoundError", async () => {
    getExecute.mockResolvedValue(Result.fail(new NotFoundError("Website", PROP)));
    const res = await getDraft(req("GET"), {
      params: Promise.resolve({ propertyId: PROP }),
    });
    expect(res.status).toBe(404);
  });

  it("maps ValidationError from use case", async () => {
    ensureExecute.mockResolvedValue(
      Result.fail(new ValidationError("bad")),
    );
    const res = await ensureWebsite(req("POST", {}), {
      params: Promise.resolve({ propertyId: PROP }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects forged tenant header before invoking use cases", async () => {
    requireTenantContext.mockRejectedValue(
      new ForbiddenError("Not a member of this tenant"),
    );
    const res = await getWebsite(req("GET", undefined, randomTenant()), {
      params: Promise.resolve({ propertyId: PROP }),
    });
    expect(res.status).toBe(403);
    expect(getExecute).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error?.code).toBe("FORBIDDEN");
    expect(JSON.stringify(body)).not.toMatch(/prisma|postgres|sql/i);
  });

  it("rejects missing authentication", async () => {
    requireTenantContext.mockRejectedValue(new UnauthorizedError());
    for (const run of [
      () =>
        getWebsite(req("GET"), { params: Promise.resolve({ propertyId: PROP }) }),
      () =>
        ensureWebsite(req("POST", {}), {
          params: Promise.resolve({ propertyId: PROP }),
        }),
      () =>
        putDraft(
          req("PUT", {
            contentSchemaVersion: 1,
            locale: "el",
            themeId: "unset",
            sections: [],
            seo: {},
          }),
          { params: Promise.resolve({ propertyId: PROP }) },
        ),
      () =>
        patchTheme(req("PATCH", { themeId: "luxury_villa" }), {
          params: Promise.resolve({ propertyId: PROP }),
        }),
    ]) {
      const res = await run();
      expect(res.status).toBe(401);
    }
    expect(getExecute).not.toHaveBeenCalled();
    expect(ensureExecute).not.toHaveBeenCalled();
    expect(saveDraftExecute).not.toHaveBeenCalled();
    expect(updateThemeExecute).not.toHaveBeenCalled();
  });

  it("forbids manager access to an unassigned property", async () => {
    const managerActor = {
      userId: "mgr-1",
      tenantId: TENANT,
      role: "manager" as const,
      propertyIds: ["99999999-9999-4999-8999-999999999999"],
    };
    requireTenantContext.mockResolvedValue(managerActor);
    getExecute.mockResolvedValue(Result.fail(new ForbiddenError()));

    const res = await getWebsite(req("GET"), {
      params: Promise.resolve({ propertyId: PROP }),
    });
    expect(res.status).toBe(403);
    expect(getExecute).toHaveBeenCalledWith(
      { tenantId: TENANT, propertyId: PROP },
      managerActor,
    );
  });

  it("does not accept tenantId or propertyId overrides from the body", async () => {
    const website = websiteFixture();
    const draft = draftFixture(website.id);
    saveDraftExecute.mockResolvedValue(Result.ok({ website, draft }));

    await putDraft(
      req("PUT", {
        contentSchemaVersion: 1,
        locale: "el",
        themeId: "unset",
        sections: [],
        seo: {},
        tenantId: "00000000-0000-4000-8000-000000000099",
        propertyId: "00000000-0000-4000-8000-000000000098",
      }),
      { params: Promise.resolve({ propertyId: PROP }) },
    );

    // Strict Zod schema rejects unknown keys before the use case runs.
    expect(saveDraftExecute).not.toHaveBeenCalled();
  });
});

function randomTenant(): string {
  return "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
}
