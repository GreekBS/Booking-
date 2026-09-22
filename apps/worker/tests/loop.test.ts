import { describe, expect, it, vi } from "vitest";
import { Result } from "@hcp/domain";
import { AsyncWorkerLoop } from "../src/loop";

function okBatch(claimed: number) {
  return Result.ok({
    claimed,
    completed: claimed,
    retried: 0,
    deadLettered: 0,
  });
}

describe("AsyncWorkerLoop", () => {
  it("A/H: processes existing pending work on startup/recovery without a new enqueue", async () => {
    const processJobs = vi
      .fn()
      .mockResolvedValueOnce(okBatch(2))
      .mockResolvedValue(okBatch(0));
    const processOutbox = vi.fn().mockResolvedValue(okBatch(0));

    const loop = new AsyncWorkerLoop({
      processors: { processJobs, processOutbox },
      jobBatchLimit: 10,
      outboxBatchLimit: 10,
      recoveryIntervalMs: 2_000,
    });

    await loop.drainOnce();

    expect(processJobs).toHaveBeenCalled();
    expect(processOutbox).toHaveBeenCalled();
    expect(processJobs.mock.calls[0]?.[0]).toBe(10);
  });

  it("B: wake signal drains jobs after enqueue wake", async () => {
    const processJobs = vi.fn().mockResolvedValue(okBatch(1));
    const processOutbox = vi.fn().mockResolvedValue(okBatch(0));

    const loop = new AsyncWorkerLoop({
      processors: { processJobs, processOutbox },
      jobBatchLimit: 5,
      outboxBatchLimit: 5,
      recoveryIntervalMs: 2_000,
    });

    loop.signalWake("jobs");
    await loop.drainOnce();

    expect(processJobs).toHaveBeenCalled();
  });

  it("C/G: recovery sweep drains even without wake", async () => {
    const processJobs = vi.fn().mockResolvedValue(okBatch(1));
    const processOutbox = vi.fn().mockResolvedValue(okBatch(1));

    const loop = new AsyncWorkerLoop({
      processors: { processJobs, processOutbox },
      jobBatchLimit: 10,
      outboxBatchLimit: 10,
      recoveryIntervalMs: 1_000,
    });

    // No signalWake — drainOnce simulates recovery sweep.
    await loop.drainOnce();

    expect(processJobs).toHaveBeenCalled();
    expect(processOutbox).toHaveBeenCalled();
  });

  it("D: duplicate wake signals do not duplicate durable processing beyond claim semantics", async () => {
    let calls = 0;
    const processJobs = vi.fn().mockImplementation(async () => {
      calls += 1;
      return okBatch(calls === 1 ? 1 : 0);
    });
    const processOutbox = vi.fn().mockResolvedValue(okBatch(0));

    const loop = new AsyncWorkerLoop({
      processors: { processJobs, processOutbox },
      jobBatchLimit: 10,
      outboxBatchLimit: 10,
      recoveryIntervalMs: 2_000,
    });

    loop.signalWake("jobs");
    loop.signalWake("jobs");
    loop.signalWake("jobs");
    await loop.drainOnce();

    // Coalesced into drain cycles; handlers run via claim APIs (idempotent durable rows).
    expect(processJobs.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(processJobs.mock.calls.length).toBeLessThanOrEqual(8);
  });

  it("F: outbox wake drains outbox processing", async () => {
    const processJobs = vi.fn().mockResolvedValue(okBatch(0));
    const processOutbox = vi.fn().mockResolvedValue(okBatch(1));

    const loop = new AsyncWorkerLoop({
      processors: { processJobs, processOutbox },
      jobBatchLimit: 10,
      outboxBatchLimit: 10,
      recoveryIntervalMs: 2_000,
    });

    loop.signalWake("outbox");
    await loop.drainOnce();

    expect(processOutbox).toHaveBeenCalled();
  });

  it("stops gracefully without throwing mid-drain abandonment", async () => {
    const processJobs = vi.fn().mockResolvedValue(okBatch(0));
    const processOutbox = vi.fn().mockResolvedValue(okBatch(0));

    const loop = new AsyncWorkerLoop({
      processors: { processJobs, processOutbox },
      jobBatchLimit: 10,
      outboxBatchLimit: 10,
      recoveryIntervalMs: 50,
      sleep: async (_ms, signal) => {
        if (signal.aborted) throw new Error("aborted");
        await new Promise((r) => setTimeout(r, 5));
      },
    });

    loop.start();
    await loop.stop();
    expect(processJobs).toHaveBeenCalled();
  });
});
