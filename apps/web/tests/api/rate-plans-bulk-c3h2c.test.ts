import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ForbiddenError, Result, ValidationError } from "@hcp/domain";

const requireTenantContext = vi.fn();
const toPermissionActor = vi.fn((actor: unknown) => actor);
const previewExecute = vi.fn();
const applyExecute = vi.fn();

vi.mock("@/lib/tenant-context", () => ({
  requireTenantContext: (...args: unknown[]) => requireTenantContext(...args),
  toPermissionActor: (...args: unknown[]) => toPermissionActor(...args),
}));

vi.mock("@/lib/di/container", () => ({
  previewBulkRatePlanFromTemplateUseCase: {
    execute: (...args: unknown[]) => previewExecute(...args),
  },
  applyBulkRatePlanFromTemplateUseCase: {
    execute: (...args: unknown[]) => applyExecute(...args),
  },
}));

import { POST as previewPost } from "@/app/api/admin/v1/properties/[propertyId]/rate-plans/copy/preview/route";
import { POST as applyPost } from "@/app/api/admin/v1/properties/[propertyId]/rate-plans/apply-from-template/route";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PROP = "22222222-2222-4222-8222-222222222222";
const SOURCE = "33333333-3333-4333-8333-333333333333";
const TARGET = "44444444-4444-4444-8444-444444444444";

const actor = {
  userId: "user-1",
  tenantId: TENANT,
  role: "admin" as const,
  propertyIds: null,
};

function previewReq(body: unknown) {
  return new NextRequest(
    `http://localhost/api/admin/v1/properties/${PROP}/rate-plans/copy/preview`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": TENANT,
      },
      body: JSON.stringify(body),
    },
  );
}

function applyReq(body: unknown) {
  return new NextRequest(
    `http://localhost/api/admin/v1/properties/${PROP}/rate-plans/apply-from-template`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-id": TENANT,
      },
      body: JSON.stringify(body),
    },
  );
}

describe("RatePlan bulk C3-H2c admin API", () => {
  beforeEach(() => {
    requireTenantContext.mockReset().mockResolvedValue(actor);
    toPermissionActor.mockClear().mockImplementation((a: unknown) => a);
    previewExecute.mockReset();
    applyExecute.mockReset();
  });

  it("preview uses session tenant and route propertyId", async () => {
    previewExecute.mockResolvedValue(
      Result.ok({
        sourceUnitId: SOURCE,
        roomTypeId: "55555555-5555-4555-8555-555555555555",
        mode: "skip_customized",
        source: {
          currency: "EUR",
          baseNightlyAmount: "100.0000",
          seasonCount: 0,
          dowModifierCount: 0,
          fingerprint: "abc",
          seasons: [],
          dowModifiers: [],
        },
        targets: [],
        applyCount: 1,
        skipCount: 0,
        overwriteCount: 0,
        customizationPolicy: "conservative_content_diff",
        confirmationToken: "token-aaaaaaaaaaaaaaaa",
        confirmationExpiresAt: new Date().toISOString(),
      }),
    );

    const res = await previewPost(
      previewReq({
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET],
        mode: "skip_customized",
        tenantId: "99999999-9999-4999-8999-999999999999",
      }),
      { params: Promise.resolve({ propertyId: PROP }) },
    );

    expect(res.status).toBe(200);
    expect(previewExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        propertyId: PROP,
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET],
        mode: "skip_customized",
      }),
      actor,
    );
    const json = await res.json();
    expect(json.confirmationToken).toMatch(/^token-/);
    expect(json.customizationPolicy).toBe("conservative_content_diff");
  });

  it("preview rejects invalid body (both selectors)", async () => {
    const res = await previewPost(
      previewReq({
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET],
        roomTypeId: "55555555-5555-4555-8555-555555555555",
      }),
      { params: Promise.resolve({ propertyId: PROP }) },
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(previewExecute).not.toHaveBeenCalled();
  });

  it("apply forwards confirmationToken and confirmOverwrite", async () => {
    applyExecute.mockResolvedValue(
      Result.ok({
        appliedUnitIds: [TARGET],
        skippedUnitIds: [],
        mode: "overwrite_all",
        sourceUnitId: SOURCE,
        confirmationReference: "bulk-rate:ref",
      }),
    );

    const res = await applyPost(
      applyReq({
        confirmationToken: "token-bbbbbbbbbbbbbbbb",
        confirmOverwrite: true,
      }),
      { params: Promise.resolve({ propertyId: PROP }) },
    );

    expect(res.status).toBe(200);
    expect(applyExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        propertyId: PROP,
        confirmationToken: "token-bbbbbbbbbbbbbbbb",
        confirmOverwrite: true,
      }),
      actor,
    );
  });

  it("maps ForbiddenError from apply", async () => {
    applyExecute.mockResolvedValue(Result.fail(new ForbiddenError()));
    const res = await applyPost(
      applyReq({ confirmationToken: "token-cccccccccccccccc" }),
      { params: Promise.resolve({ propertyId: PROP }) },
    );
    expect(res.status).toBe(403);
  });

  it("maps ValidationError from preview", async () => {
    previewExecute.mockResolvedValue(
      Result.fail(new ValidationError("Source unit has no rate plan configured")),
    );
    const res = await previewPost(
      previewReq({
        sourceUnitId: SOURCE,
        targetUnitIds: [TARGET],
      }),
      { params: Promise.resolve({ propertyId: PROP }) },
    );
    expect(res.status).toBe(400);
  });
});
