import { describe, expect, it, vi } from "vitest";
import { RequestLeadDemoUseCase } from "../src/marketing/application/RequestLeadDemoUseCase";
import { UpdateLeadStatusUseCase } from "../src/marketing/application/UpdateLeadStatusUseCase";
import { Lead } from "../src/marketing/domain/Lead";
import type { ILeadRepository } from "../src/marketing/ports/ILeadRepository";

function makeLead(overrides: Partial<{ id: string }> = {}) {
  return Lead.create({
    id: overrides.id ?? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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

function stubRepo(overrides: Partial<ILeadRepository> = {}): ILeadRepository {
  return {
    create: vi.fn(),
    findBySubmissionId: vi.fn(async () => null),
    findById: vi.fn(async () => null),
    list: vi.fn(async () => ({ data: [], total: 0, page: 1, limit: 50 })),
    markDemoRequested: vi.fn(async () => null),
    updateStatus: vi.fn(async () => null),
    ...overrides,
  };
}

describe("RequestLeadDemoUseCase", () => {
  it("marks demo requested and returns timestamp", async () => {
    const lead = makeLead();
    const at = new Date("2026-09-20T12:00:00.000Z");
    const updated = Lead.reconstitute({
      ...lead.toPersistence(),
      demoRequestedAt: at,
    });
    const repo = stubRepo({
      findById: vi.fn(async () => lead),
      markDemoRequested: vi.fn(async () => updated),
    });
    const useCase = new RequestLeadDemoUseCase(repo);

    const result = await useCase.execute({ leadId: lead.id });
    expect(result.isFailure).toBe(false);
    expect(result.getValue().demoRequestedAt.toISOString()).toBe(at.toISOString());
    expect(repo.markDemoRequested).toHaveBeenCalled();
  });

  it("is idempotent when demo already requested", async () => {
    const at = new Date("2026-09-20T10:00:00.000Z");
    const lead = Lead.reconstitute({
      ...makeLead().toPersistence(),
      demoRequestedAt: at,
    });
    const repo = stubRepo({
      findById: vi.fn(async () => lead),
      markDemoRequested: vi.fn(async () => {
        throw new Error("should not mark again");
      }),
    });
    const useCase = new RequestLeadDemoUseCase(repo);

    const result = await useCase.execute({ leadId: lead.id });
    expect(result.getValue().demoRequestedAt.toISOString()).toBe(at.toISOString());
    expect(repo.markDemoRequested).not.toHaveBeenCalled();
  });

  it("fails when lead is missing", async () => {
    const useCase = new RequestLeadDemoUseCase(stubRepo());
    const result = await useCase.execute({ leadId: "missing" });
    expect(result.isFailure).toBe(true);
  });
});

describe("UpdateLeadStatusUseCase", () => {
  it("updates status through repository", async () => {
    const lead = makeLead();
    const updated = Lead.reconstitute({
      ...lead.toPersistence(),
      status: "contacted",
    });
    const repo = stubRepo({
      findById: vi.fn(async () => lead),
      updateStatus: vi.fn(async () => updated),
    });
    const useCase = new UpdateLeadStatusUseCase(repo);
    const result = await useCase.execute({
      leadId: lead.id,
      status: "contacted",
    });
    expect(result.isFailure).toBe(false);
    expect(result.getValue().status).toBe("contacted");
  });

  it("rejects invalid status", async () => {
    const useCase = new UpdateLeadStatusUseCase(stubRepo());
    const result = await useCase.execute({
      leadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      status: "not-a-status" as never,
    });
    expect(result.isFailure).toBe(true);
  });
});

describe("Lead.requestDemo", () => {
  it("sets demoRequestedAt once", () => {
    const lead = makeLead();
    const first = new Date("2026-09-20T08:00:00.000Z");
    const second = new Date("2026-09-20T09:00:00.000Z");
    lead.requestDemo(first);
    expect(lead.demoRequestedAt?.toISOString()).toBe(first.toISOString());
    lead.requestDemo(second);
    expect(lead.demoRequestedAt?.toISOString()).toBe(first.toISOString());
    expect(lead.status).toBe("new");
  });
});
