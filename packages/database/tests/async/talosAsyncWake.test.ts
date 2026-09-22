import { describe, expect, it, vi } from "vitest";
import {
  TALOS_ASYNC_WAKE_JOBS_CHANNEL,
  TALOS_ASYNC_WAKE_OUTBOX_CHANNEL,
  assertTalosAsyncWakeChannel,
  notifyTalosAsyncWake,
} from "@hcp/database";

describe("talosAsyncWake", () => {
  it("accepts only Talos-owned channel names", () => {
    expect(() => assertTalosAsyncWakeChannel(TALOS_ASYNC_WAKE_JOBS_CHANNEL)).not.toThrow();
    expect(() => assertTalosAsyncWakeChannel(TALOS_ASYNC_WAKE_OUTBOX_CHANNEL)).not.toThrow();
    expect(() => assertTalosAsyncWakeChannel("evil_channel")).toThrow(/Unknown Talos async wake/);
  });

  it("issues pg_notify with empty payload and never throws", async () => {
    const executeRaw = vi.fn().mockResolvedValue(undefined);
    await notifyTalosAsyncWake(
      { $executeRaw: executeRaw },
      TALOS_ASYNC_WAKE_JOBS_CHANNEL,
    );
    expect(executeRaw).toHaveBeenCalledOnce();

    const failing = vi.fn().mockRejectedValue(new Error("notify failed"));
    await expect(
      notifyTalosAsyncWake({ $executeRaw: failing }, TALOS_ASYNC_WAKE_OUTBOX_CHANNEL),
    ).resolves.toBeUndefined();
  });
});
