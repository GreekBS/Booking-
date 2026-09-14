import { describe, it, expect, vi } from "vitest";
import type { BackgroundJobEntry } from "../../../src/shared/types/index";
import { EXPIRE_HOLDS_JOB_TYPE } from "../../../src/platform/async/jobs/types/JobTypes";
import { ExpireHoldsJobHandler } from "../../../src/commerce/jobs/ExpireHoldsJobHandler";
import { Result } from "../../../src/shared/kernel/Result";
import type { ExpireHoldsUseCase } from "../../../src/commerce/application/CommerceUseCases";

function makeJob(payload: Record<string, unknown> = {}): BackgroundJobEntry {
  return {
    id: "job-1",
    tenantId: null,
    jobType: EXPIRE_HOLDS_JOB_TYPE,
    payload,
    status: "processing",
    priority: 0,
    runAt: new Date(),
    idempotencyKey: "key-1",
    attemptCount: 0,
    maxAttempts: 5,
  createdAt: new Date(),
  };
}

describe("ExpireHoldsJobHandler", () => {
  it("delegates to ExpireHoldsUseCase and completes on success", async () => {
    const execute = vi.fn().mockResolvedValue(Result.ok({ expired: 2 }));
    const handler = new ExpireHoldsJobHandler({ execute } as unknown as ExpireHoldsUseCase);

    expect(handler.canHandle(EXPIRE_HOLDS_JOB_TYPE)).toBe(true);
    expect(handler.canHandle("logging_ping")).toBe(false);

    await handler.run(makeJob({ limit: 50 }));

    expect(execute).toHaveBeenCalledWith(expect.any(Date), 50);
  });

  it("throws when ExpireHoldsUseCase fails", async () => {
    const execute = vi.fn().mockResolvedValue(Result.fail(new Error("db unavailable")));
    const handler = new ExpireHoldsJobHandler({ execute } as unknown as ExpireHoldsUseCase);

    await expect(handler.run(makeJob())).rejects.toThrow("db unavailable");
  });

  it("defaults limit to 100 when payload omits limit", async () => {
    const execute = vi.fn().mockResolvedValue(Result.ok({ expired: 0 }));
    const handler = new ExpireHoldsJobHandler({ execute } as unknown as ExpireHoldsUseCase);

    await handler.run(makeJob());

    expect(execute).toHaveBeenCalledWith(expect.any(Date), 100);
  });
});
