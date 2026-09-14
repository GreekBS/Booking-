import { describe, expect, it, vi } from "vitest";
import type { BackgroundJobEntry, IBackgroundJobHandler } from "@hcp/domain";
import { POLL_CHANNEL_CONNECTION_JOB_TYPE } from "@hcp/domain";
import { isChannelsPollingEnabled } from "@/lib/channels/polling-enabled";
import { PollingFeatureGatedPollJobHandler } from "@/lib/channels/PollingFeatureGatedPollJobHandler";

function buildJob(
  payload: Record<string, unknown> = { connectionId: "conn-1" },
): BackgroundJobEntry {
  return {
    id: "job-1",
    tenantId: "tenant-1",
    jobType: POLL_CHANNEL_CONNECTION_JOB_TYPE,
    payload,
    status: "pending",
    priority: 0,
    runAt: new Date(),
    idempotencyKey: null,
    attemptCount: 0,
    maxAttempts: 5,
  };
}

describe("CHANNELS_POLLING_ENABLED (S4a-2a)", () => {
  it("defaults off; enabled only for exact true", () => {
    expect(isChannelsPollingEnabled({})).toBe(false);
    expect(isChannelsPollingEnabled({ CHANNELS_POLLING_ENABLED: "TRUE" })).toBe(false);
    expect(isChannelsPollingEnabled({ CHANNELS_POLLING_ENABLED: "1" })).toBe(false);
    expect(isChannelsPollingEnabled({ CHANNELS_POLLING_ENABLED: "true" })).toBe(true);
  });
});

describe("PollingFeatureGatedPollJobHandler (S4a-2a)", () => {
  it("delegates canHandle to inner handler", () => {
    const inner: IBackgroundJobHandler = {
      canHandle: (jobType) => jobType === POLL_CHANNEL_CONNECTION_JOB_TYPE,
      run: vi.fn(),
    };
    const gated = new PollingFeatureGatedPollJobHandler(inner, () => true);
    expect(gated.canHandle(POLL_CHANNEL_CONNECTION_JOB_TYPE)).toBe(true);
    expect(gated.canHandle("other")).toBe(false);
  });

  it("when polling disabled: completes without invoking inner run", async () => {
    const run = vi.fn(async () => undefined);
    const inner: IBackgroundJobHandler = {
      canHandle: () => true,
      run,
    };
    const gated = new PollingFeatureGatedPollJobHandler(inner, () => false);
    await expect(gated.run(buildJob())).resolves.toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });

  it("when polling disabled: still no-ops for malformed payload (no dead-letter)", async () => {
    const run = vi.fn(async () => undefined);
    const inner: IBackgroundJobHandler = {
      canHandle: () => true,
      run,
    };
    const gated = new PollingFeatureGatedPollJobHandler(inner, () => false);
    await expect(gated.run(buildJob({}))).resolves.toBeUndefined();
    expect(run).not.toHaveBeenCalled();
  });

  it("when polling enabled: invokes inner run once", async () => {
    const run = vi.fn(async () => undefined);
    const inner: IBackgroundJobHandler = {
      canHandle: () => true,
      run,
    };
    const gated = new PollingFeatureGatedPollJobHandler(inner, () => true);
    const job = buildJob();
    await gated.run(job);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(job);
  });

  it("when polling enabled: propagates retryable inner failure", async () => {
    const inner: IBackgroundJobHandler = {
      canHandle: () => true,
      run: vi.fn(async () => {
        throw new Error("POLL_TRANSIENT_RETRY");
      }),
    };
    const gated = new PollingFeatureGatedPollJobHandler(inner, () => true);
    await expect(gated.run(buildJob())).rejects.toThrow(/POLL_TRANSIENT_RETRY/);
  });
});
