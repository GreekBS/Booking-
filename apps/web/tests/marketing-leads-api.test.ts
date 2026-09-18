/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();

vi.mock("@/lib/di/container", () => ({
  createLeadUseCase: { execute: (...args: unknown[]) => execute(...args) },
}));

vi.mock("@/lib/security/csrf", () => ({
  validateCsrf: vi.fn(),
}));

vi.mock("@/lib/marketing/lead-rate-limit", () => ({
  checkLeadRateLimit: vi.fn(),
  resetLeadRateLimitForTests: vi.fn(),
}));

vi.mock("@/lib/logging/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

import { Result } from "@hcp/domain";
import { POST } from "@/app/api/marketing/v1/leads/route";
import { checkLeadRateLimit } from "@/lib/marketing/lead-rate-limit";
import { RateLimitedError } from "@/lib/channels/channel-transport-rate-limit";

function request(body: unknown) {
  return new Request("http://localhost/api/marketing/v1/leads", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      host: "localhost",
    },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const validBody = {
  submissionId: "11111111-1111-4111-8111-111111111111",
  fullName: "Ada Owner",
  email: "ada@example.com",
  country: "Greece",
  relationship: "owner",
  portfolioSize: "two_to_five",
  accommodationTypes: ["villa"],
  propertyCountry: "Greece",
  operatingState: "operating",
  interests: ["run"],
  source: "homepage_hero",
};

describe("POST /api/marketing/v1/leads", () => {
  beforeEach(() => {
    execute.mockReset();
    vi.mocked(checkLeadRateLimit).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with minimal id payload", async () => {
    execute.mockResolvedValue(Result.ok({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }));
    const res = await POST(request(validBody));
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ada@example.com", submissionId: validBody.submissionId }),
    );
  });

  it("returns 400 for validation / mass-assignment attempts", async () => {
    const res = await POST(
      request({
        ...validBody,
        status: "won",
        platformRole: "super_admin",
      }),
    );
    expect(res.status).toBe(400);
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limited", async () => {
    vi.mocked(checkLeadRateLimit).mockImplementation(() => {
      throw new RateLimitedError();
    });
    const res = await POST(request(validBody));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error.code).toBe("RATE_LIMITED");
  });
});
