import { describe, expect, it, vi } from "vitest";
import { GetPlatformOverviewUseCase } from "../src/platform/application/GetPlatformOverviewUseCase";
import { Lead } from "../src/marketing/domain/Lead";
import type { ILeadRepository } from "../src/marketing/ports/ILeadRepository";
import type { ITenantRepository } from "../src/platform/ports/ITenantRepository";
import { Tenant } from "../src/platform/domain/Tenant";

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

describe("GetPlatformOverviewUseCase", () => {
  it("aggregates counts and recent rows without inventing metrics", async () => {
    const lead = makeLead();
    lead.requestDemo(new Date("2026-09-20T12:00:00.000Z"));
    const tenant = Tenant.create({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Demo Hotel",
      slug: "demo-hotel",
    });

    const leadRepo: ILeadRepository = {
      create: vi.fn(),
      findBySubmissionId: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(async () => ({
        data: [lead],
        total: 1,
        page: 1,
        limit: 8,
      })),
      countSummary: vi.fn(async () => ({
        total: 4,
        newCount: 2,
        demoRequestedCount: 1,
      })),
      markDemoRequested: vi.fn(),
      updateStatus: vi.fn(),
    };

    const tenantRepo: ITenantRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findBySlug: vi.fn(),
      existsBySlug: vi.fn(),
      findAll: vi.fn(async () => ({
        data: [tenant],
        total: 1,
        page: 1,
        limit: 8,
      })),
      countProperties: vi.fn(),
      countSummary: vi.fn(async () => ({
        total: 3,
        active: 2,
        suspended: 1,
      })),
    };

    const useCase = new GetPlatformOverviewUseCase(tenantRepo, leadRepo);
    const result = await useCase.execute();
    expect(result.isFailure).toBe(false);
    const overview = result.getValue();
    expect(overview.tenants).toEqual({ total: 3, active: 2, suspended: 1 });
    expect(overview.leads).toEqual({
      total: 4,
      newCount: 2,
      demoRequestedCount: 1,
    });
    expect(overview.recentLeads).toHaveLength(1);
    expect(overview.recentTenants).toHaveLength(1);
    expect(overview.needsAttention.map((i) => i.kind)).toEqual([
      "new_leads",
      "demo_requests",
      "suspended_tenants",
    ]);
  });

  it("returns empty needs attention when counts are zero", async () => {
    const leadRepo: ILeadRepository = {
      create: vi.fn(),
      findBySubmissionId: vi.fn(),
      findById: vi.fn(),
      list: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 8 })),
      countSummary: vi.fn(async () => ({
        total: 0,
        newCount: 0,
        demoRequestedCount: 0,
      })),
      markDemoRequested: vi.fn(),
      updateStatus: vi.fn(),
    };
    const tenantRepo: ITenantRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findBySlug: vi.fn(),
      existsBySlug: vi.fn(),
      findAll: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 8 })),
      countProperties: vi.fn(),
      countSummary: vi.fn(async () => ({
        total: 0,
        active: 0,
        suspended: 0,
      })),
    };
    const result = await new GetPlatformOverviewUseCase(
      tenantRepo,
      leadRepo,
    ).execute();
    expect(result.getValue().needsAttention).toEqual([]);
  });
});
