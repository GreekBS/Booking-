import { describe, expect, it, vi } from "vitest";
import { GetPlatformOverviewUseCase } from "../src/platform/application/GetPlatformOverviewUseCase";
import { ListPlatformChannelsUseCase } from "../src/platform/application/ListPlatformChannelsUseCase";
import { ListPlatformJobsUseCase } from "../src/platform/application/ListPlatformJobsUseCase";
import { GetPlatformOperationsHealthUseCase } from "../src/platform/application/GetPlatformOperationsHealthUseCase";
import { GetPlatformChannelDetailUseCase } from "../src/platform/application/GetPlatformChannelDetailUseCase";
import { Lead } from "../src/marketing/domain/Lead";
import type { ILeadRepository } from "../src/marketing/ports/ILeadRepository";
import type { ITenantRepository } from "../src/platform/ports/ITenantRepository";
import type { IPlatformDirectoryRepository } from "../src/platform/ports/IPlatformDirectoryRepository";
import type { IPlatformOperationsRepository } from "../src/platform/ports/IPlatformOperationsRepository";
import { Tenant } from "../src/platform/domain/Tenant";
import { NotFoundError } from "../src/shared/errors/DomainError";

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

function emptyDirectory(
  overrides: Partial<IPlatformDirectoryRepository> = {},
): IPlatformDirectoryRepository {
  return {
    countProperties: vi.fn(async () => 0),
    countUsers: vi.fn(async () => 0),
    listProperties: vi.fn(async () => ({
      data: [],
      total: 0,
      page: 1,
      limit: 50,
    })),
    listUsers: vi.fn(async () => ({
      data: [],
      total: 0,
      page: 1,
      limit: 50,
    })),
    getTenantDetail: vi.fn(async () => null),
    ...overrides,
  };
}

function emptyOperations(
  overrides: Partial<IPlatformOperationsRepository> = {},
): IPlatformOperationsRepository {
  return {
    listConnections: vi.fn(async () => ({
      data: [],
      total: 0,
      page: 1,
      limit: 50,
    })),
    getConnectionDetail: vi.fn(async () => null),
    listJobs: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 50 })),
    listInbox: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 50 })),
    listOutbox: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 50 })),
    getHealthSummary: vi.fn(async () => ({
      connections: [],
      jobs: [],
      inbox: [],
      outbox: [],
    })),
    getAttentionSignals: vi.fn(async () => ({
      connectionsError: 0,
      jobsDeadLetter: 0,
      jobsFailedPending: 0,
      inboxFailed: 0,
      inboxDeadLetter: 0,
      outboxDeadLetter: 0,
    })),
    ...overrides,
  };
}

describe("GetPlatformOverviewUseCase", () => {
  it("aggregates counts and includes operational attention signals", async () => {
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

    const directory = emptyDirectory({
      countProperties: vi.fn(async () => 12),
      countUsers: vi.fn(async () => 9),
    });
    const operations = emptyOperations({
      getAttentionSignals: vi.fn(async () => ({
        connectionsError: 2,
        jobsDeadLetter: 1,
        jobsFailedPending: 0,
        inboxFailed: 3,
        inboxDeadLetter: 0,
        outboxDeadLetter: 4,
      })),
    });

    const result = await new GetPlatformOverviewUseCase(
      tenantRepo,
      leadRepo,
      directory,
      operations,
    ).execute();
    expect(result.isFailure).toBe(false);
    const overview = result.getValue();
    expect(overview.properties.total).toBe(12);
    expect(overview.users.total).toBe(9);
    expect(overview.needsAttention.map((i) => i.kind)).toEqual([
      "new_leads",
      "demo_requests",
      "suspended_tenants",
      "channel_errors",
      "failed_jobs",
      "dead_letter_outbox",
      "inbox_attention",
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
      emptyDirectory(),
      emptyOperations(),
    ).execute();
    expect(result.getValue().needsAttention).toEqual([]);
  });
});

describe("ListPlatformChannelsUseCase", () => {
  it("rejects invalid status and forwards filters", async () => {
    const listConnections = vi.fn(async () => ({
      data: [],
      total: 0,
      page: 1,
      limit: 25,
    }));
    const useCase = new ListPlatformChannelsUseCase(
      emptyOperations({ listConnections }),
    );
    expect(
      (await useCase.execute({ status: "bogus" as "active" })).isFailure,
    ).toBe(true);
    const ok = await useCase.execute({
      page: 1,
      limit: 25,
      provider: "ical",
      status: "error",
    });
    expect(ok.isSuccess).toBe(true);
    expect(listConnections).toHaveBeenCalledWith({
      page: 1,
      limit: 25,
      q: undefined,
      tenantId: undefined,
      provider: "ical",
      status: "error",
    });
  });
});

describe("ListPlatformJobsUseCase", () => {
  it("rejects invalid pagination", async () => {
    const useCase = new ListPlatformJobsUseCase(emptyOperations());
    expect((await useCase.execute({ page: 0 })).isFailure).toBe(true);
  });
});

describe("GetPlatformOperationsHealthUseCase", () => {
  it("returns health summary from operations repository", async () => {
    const health = {
      connections: [{ status: "error", count: 1 }],
      jobs: [{ status: "dead_letter", count: 2 }],
      inbox: [],
      outbox: [{ status: "dead_letter", count: 3 }],
    };
    const result = await new GetPlatformOperationsHealthUseCase(
      emptyOperations({ getHealthSummary: vi.fn(async () => health) }),
    ).execute();
    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual(health);
  });
});

describe("GetPlatformChannelDetailUseCase", () => {
  it("returns not found when missing", async () => {
    const result = await new GetPlatformChannelDetailUseCase(
      emptyOperations(),
    ).execute("t1", "c1");
    expect(result.isFailure).toBe(true);
    expect(result.getError()).toBeInstanceOf(NotFoundError);
  });
});

describe("ListPlatformPropertiesUseCase", () => {
  it("forwards filters to the directory repository", async () => {
    const { ListPlatformPropertiesUseCase } = await import(
      "../src/platform/application/ListPlatformPropertiesUseCase"
    );
    const listProperties = vi.fn(async () => ({
      data: [],
      total: 0,
      page: 1,
      limit: 25,
    }));
    const useCase = new ListPlatformPropertiesUseCase(
      emptyDirectory({ listProperties }),
    );
    const result = await useCase.execute({
      page: 1,
      limit: 25,
      q: " villa ",
      tenantId: "t1",
      city: "Athens",
      status: "active",
    });
    expect(result.isSuccess).toBe(true);
    expect(listProperties).toHaveBeenCalledWith({
      page: 1,
      limit: 25,
      q: "villa",
      tenantId: "t1",
      city: "Athens",
      status: "active",
    });
  });
});

describe("ListPlatformUsersUseCase", () => {
  it("preserves multi-tenant memberships from the directory", async () => {
    const { ListPlatformUsersUseCase } = await import(
      "../src/platform/application/ListPlatformUsersUseCase"
    );
    const listUsers = vi.fn(async () => ({
      data: [
        {
          id: "u1",
          name: "Sam",
          email: "sam@example.com",
          platformRole: null as const,
          emailVerified: null,
          createdAt: new Date("2026-01-01"),
          memberships: [
            {
              membershipId: "m1",
              tenantId: "t1",
              tenantName: "Alpha",
              tenantSlug: "alpha",
              role: "admin" as const,
              status: "active" as const,
            },
            {
              membershipId: "m2",
              tenantId: "t2",
              tenantName: "Beta",
              tenantSlug: "beta",
              role: "manager" as const,
              status: "active" as const,
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    }));
    const result = await new ListPlatformUsersUseCase(
      emptyDirectory({ listUsers }),
    ).execute({ q: "sam" });
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().data[0].memberships).toHaveLength(2);
  });
});
