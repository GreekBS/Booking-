import { describe, expect, it, vi } from "vitest";
import { CreateLeadUseCase } from "../src/marketing/application/CreateLeadUseCase";
import { Lead } from "../src/marketing/domain/Lead";
import type { ILeadRepository } from "../src/marketing/ports/ILeadRepository";
import type { IIdGenerator } from "../src/shared/ports/IIdGenerator";

function validCommand(overrides: Record<string, unknown> = {}) {
  return {
    submissionId: "11111111-1111-4111-8111-111111111111",
    fullName: "Ada Owner",
    email: "Ada@Example.COM",
    country: "Greece",
    relationship: "owner" as const,
    portfolioSize: "two_to_five" as const,
    accommodationTypes: ["villa" as const],
    propertyCountry: "Greece",
    operatingState: "operating" as const,
    interests: ["run" as const],
    source: "homepage_hero" as const,
    ...overrides,
  };
}

describe("CreateLeadUseCase", () => {
  it("creates a Lead with status new and normalized email", async () => {
    const created: Lead[] = [];
    const repo: ILeadRepository = {
      findBySubmissionId: vi.fn(async () => null),
      create: vi.fn(async (lead) => {
        created.push(lead);
      }),
    };
    const ids: IIdGenerator = { generate: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
    const useCase = new CreateLeadUseCase(repo, ids);

    const result = await useCase.execute(validCommand());
    expect(result.isFailure).toBe(false);
    expect(result.getValue().id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(created).toHaveLength(1);
    expect(created[0]!.status).toBe("new");
    expect(created[0]!.emailNormalized).toBe("ada@example.com");
  });

  it("allows optional revenue, phone, and message to be omitted", async () => {
    const repo: ILeadRepository = {
      findBySubmissionId: vi.fn(async () => null),
      create: vi.fn(async () => undefined),
    };
    const useCase = new CreateLeadUseCase(repo, {
      generate: () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });

    const result = await useCase.execute(validCommand());
    expect(result.isFailure).toBe(false);
    const lead = (repo.create as ReturnType<typeof vi.fn>).mock.calls[0][0] as Lead;
    expect(lead.toPersistence().revenueRange).toBeNull();
    expect(lead.toPersistence().phone).toBeNull();
    expect(lead.toPersistence().message).toBeNull();
  });

  it("returns existing Lead for the same submissionId (idempotent retry)", async () => {
    const existing = Lead.create({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
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
    const repo: ILeadRepository = {
      findBySubmissionId: vi.fn(async () => existing),
      create: vi.fn(async () => {
        throw new Error("should not create");
      }),
    };
    const useCase = new CreateLeadUseCase(repo, {
      generate: () => "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    });

    const result = await useCase.execute(validCommand());
    expect(result.getValue().id).toBe(existing.id);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("creates distinct Leads for the same email with different submissionIds", async () => {
    const created: Lead[] = [];
    const repo: ILeadRepository = {
      findBySubmissionId: vi.fn(async () => null),
      create: vi.fn(async (lead) => {
        created.push(lead);
      }),
    };
    let n = 0;
    const useCase = new CreateLeadUseCase(repo, {
      generate: () =>
        n++ === 0
          ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
          : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });

    await useCase.execute(
      validCommand({ submissionId: "11111111-1111-4111-8111-111111111111" }),
    );
    await useCase.execute(
      validCommand({ submissionId: "22222222-2222-4222-8222-222222222222" }),
    );

    expect(created).toHaveLength(2);
    expect(created[0]!.emailNormalized).toBe(created[1]!.emailNormalized);
    expect(created[0]!.id).not.toBe(created[1]!.id);
    expect(created[0]!.submissionId).not.toBe(created[1]!.submissionId);
  });

  it("rejects empty interests and accommodation types", async () => {
    const repo: ILeadRepository = {
      findBySubmissionId: vi.fn(async () => null),
      create: vi.fn(),
    };
    const useCase = new CreateLeadUseCase(repo, {
      generate: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    const noInterests = await useCase.execute(validCommand({ interests: [] }));
    expect(noInterests.isFailure).toBe(true);

    const noTypes = await useCase.execute(validCommand({ accommodationTypes: [] }));
    expect(noTypes.isFailure).toBe(true);
    expect(repo.create).not.toHaveBeenCalled();
  });
});
