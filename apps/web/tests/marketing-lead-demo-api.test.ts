/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();

vi.mock("@/lib/di/container", () => ({
  requestLeadDemoUseCase: { execute: (...args: unknown[]) => execute(...args) },
}));

vi.mock("@/lib/security/csrf", () => ({
  validateCsrf: vi.fn(),
}));

vi.mock("@/lib/marketing/lead-rate-limit", () => ({
  checkLeadRateLimit: vi.fn(),
}));

vi.mock("@/lib/logging/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

import { Result } from "@hcp/domain";
import { POST } from "@/app/api/marketing/v1/leads/[leadId]/demo/route";

function request() {
  return new Request("http://localhost/api/marketing/v1/leads/lead-1/demo", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      host: "localhost",
    },
    body: "{}",
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/marketing/v1/leads/[leadId]/demo", () => {
  beforeEach(() => {
    execute.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns demoRequestedAt on success", async () => {
    const at = new Date("2026-09-20T12:00:00.000Z");
    execute.mockResolvedValue(
      Result.ok({ id: "lead-1", demoRequestedAt: at }),
    );
    const res = await POST(request(), {
      params: Promise.resolve({ leadId: "lead-1" }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      id: "lead-1",
      demoRequestedAt: at.toISOString(),
    });
    expect(execute).toHaveBeenCalledWith({ leadId: "lead-1" });
  });

  it("maps not found failures", async () => {
    const { NotFoundError } = await import("@hcp/domain");
    execute.mockResolvedValue(Result.fail(new NotFoundError("Lead", "missing")));
    const res = await POST(request(), {
      params: Promise.resolve({ leadId: "missing" }),
    });
    expect(res.status).toBe(404);
  });
});
