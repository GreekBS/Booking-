/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSuperAdmin = vi.fn();
const listExecute = vi.fn();
const getExecute = vi.fn();
const updateExecute = vi.fn();

vi.mock("@/lib/tenant-context", () => ({
  requireSuperAdmin: (...args: unknown[]) => requireSuperAdmin(...args),
}));

vi.mock("@/lib/di/container", () => ({
  listLeadsUseCase: { execute: (...args: unknown[]) => listExecute(...args) },
  getLeadUseCase: { execute: (...args: unknown[]) => getExecute(...args) },
  updateLeadStatusUseCase: {
    execute: (...args: unknown[]) => updateExecute(...args),
  },
}));

import { ForbiddenError, Lead, Result } from "@hcp/domain";
import { GET as listLeads } from "@/app/api/platform/v1/leads/route";
import { GET as getLead } from "@/app/api/platform/v1/leads/[leadId]/route";
import { PATCH as patchStatus } from "@/app/api/platform/v1/leads/[leadId]/status/route";

function makeLead() {
  return Lead.create({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    submissionId: "11111111-1111-4111-8111-111111111111",
    fullName: "Ada Owner",
    email: "ada@example.com",
    phone: null,
    country: "Greece",
    relationship: "owner",
    portfolioSize: "two_to_five",
    accommodationTypes: ["villa"],
    propertyCountry: "Greece",
    propertyCity: null,
    operatingState: "operating",
    channels: [],
    tools: [],
    softwareName: null,
    hasWebsite: null,
    acceptsDirectBookings: null,
    revenueRange: null,
    interests: ["run"],
    message: null,
    source: "homepage_hero",
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
  });
}

describe("Platform Leads API authorization", () => {
  beforeEach(() => {
    requireSuperAdmin.mockReset();
    listExecute.mockReset();
    getExecute.mockReset();
    updateExecute.mockReset();
  });

  it("lists leads for Super Admin", async () => {
    requireSuperAdmin.mockResolvedValue({
      userId: "sa",
      platformRole: "super_admin",
    });
    const lead = makeLead();
    listExecute.mockResolvedValue(
      Result.ok({ data: [lead], total: 1, page: 1, limit: 50 }),
    );
    const req = new Request("http://localhost/api/platform/v1/leads") as unknown as import("next/server").NextRequest;
    Object.defineProperty(req, "nextUrl", {
      value: new URL("http://localhost/api/platform/v1/leads"),
    });
    const res = await listLeads(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].email).toBe("ada@example.com");
  });

  it("rejects non-Super Admin list access", async () => {
    requireSuperAdmin.mockRejectedValue(new ForbiddenError("Super admin access required"));
    const req = new Request("http://localhost/api/platform/v1/leads") as unknown as import("next/server").NextRequest;
    Object.defineProperty(req, "nextUrl", {
      value: new URL("http://localhost/api/platform/v1/leads"),
    });
    const res = await listLeads(req);
    expect(res.status).toBe(403);
    expect(listExecute).not.toHaveBeenCalled();
  });

  it("reads lead detail for Super Admin", async () => {
    requireSuperAdmin.mockResolvedValue({
      userId: "sa",
      platformRole: "super_admin",
    });
    getExecute.mockResolvedValue(Result.ok(makeLead()));
    const res = await getLead(new Request("http://localhost"), {
      params: Promise.resolve({ leadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    });
    expect(res.status).toBe(200);
  });

  it("updates status for Super Admin only through status route", async () => {
    requireSuperAdmin.mockResolvedValue({
      userId: "sa",
      platformRole: "super_admin",
    });
    const updated = makeLead();
    updated.changeStatus("contacted");
    updateExecute.mockResolvedValue(Result.ok(updated));
    const req = new Request("http://localhost/api/platform/v1/leads/x/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "contacted" }),
    }) as unknown as import("next/server").NextRequest;
    const res = await patchStatus(req, {
      params: Promise.resolve({ leadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    });
    expect(res.status).toBe(200);
    expect(updateExecute).toHaveBeenCalledWith({
      leadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "contacted",
    });
  });

  it("blocks status update when requireSuperAdmin fails (stale JWT path)", async () => {
    requireSuperAdmin.mockRejectedValue(new ForbiddenError("Super admin access required"));
    const req = new Request("http://localhost/api/platform/v1/leads/x/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "won" }),
    }) as unknown as import("next/server").NextRequest;
    const res = await patchStatus(req, {
      params: Promise.resolve({ leadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    });
    expect(res.status).toBe(403);
    expect(updateExecute).not.toHaveBeenCalled();
  });
});
