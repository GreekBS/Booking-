import { describe, expect, it, vi } from "vitest";
import { Result, EXPIRE_HOLDS_JOB_TYPE } from "@hcp/domain";
import {
  SchedulerRunner,
  createIcalPollSchedulerHook,
  createHoldExpirySchedulerHook,
  createProviderRetrievalSchedulerHook,
  buildExpireHoldsIdempotencyKey,
  buildSchedulerHooks,
  ICAL_POLL_SCHEDULER_HOOK_NAME,
  HOLD_EXPIRY_SCHEDULER_HOOK_NAME,
  PROVIDER_RETRIEVAL_SCHEDULER_FORBIDDEN_IMPORT_PATTERNS,
  providerRetrievalHookName,
} from "../src/scheduler";
import { loadWorkerSchedulerConfig } from "../src/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AsyncWorkerLoop } from "../src/loop";

describe("worker scheduler batch", () => {
  it("A: iCal scheduler invokes existing ScheduleIcalPollsUseCase", async () => {
    const execute = vi.fn().mockResolvedValue(
      Result.ok({
        examined: 2,
        enqueuedPolls: 1,
        skipped: 1,
        enqueuedSweep: 1,
        skippedReasons: {
          inFlight: 1,
          deadLetter: 0,
          sameBucketTerminal: 0,
          providerNotRegistered: 0,
          enqueueFailed: 0,
        },
      }),
    );

    const hook = createIcalPollSchedulerHook({
      enabled: true,
      intervalMs: 60_000,
      scheduleIcalPolls: { execute },
    });

    const result = await hook.run({
      signal: new AbortController().signal,
      now: () => new Date("2026-09-22T12:00:00.000Z"),
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(result?.enqueued).toBe(2); // polls + sweep
    expect(result?.examined).toBe(2);
  });

  it("B/C: scheduled iCal work is enqueue-only (no inventory/business execution in hook)", async () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/scheduler/icalPollScheduler.ts"),
      "utf8",
    );
    expect(source).toContain("ScheduleIcalPolls");
    expect(source).not.toMatch(/ExecuteChannelPollConnectionUseCase/);
    expect(source).not.toMatch(/ReconcileIcalImportedInventory/);
    expect(source).not.toMatch(/IHoldRepository|IBookingRepository|ICalendarBlock/);
  });

  it("D/K: repeated ticks converge via durable idempotency (expire_holds minute key)", async () => {
    const now = new Date("2026-09-22T12:00:30.000Z");
    const key = buildExpireHoldsIdempotencyKey(now);
    expect(key).toBe("expire_holds:2026-09-22T12:00");

    const job = {
      id: "job-1",
      status: "pending" as const,
      jobType: EXPIRE_HOLDS_JOB_TYPE,
    };
    const execute = vi.fn().mockResolvedValue(Result.ok(job));

    const hook = createHoldExpirySchedulerHook({
      enabled: true,
      intervalMs: 60_000,
      enqueueJob: { execute },
    });

    await hook.run({ signal: new AbortController().signal, now: () => now });
    await hook.run({ signal: new AbortController().signal, now: () => now });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]?.[0].idempotencyKey).toBe(key);
    expect(execute.mock.calls[1]?.[0].idempotencyKey).toBe(key);
    // Multi-worker safety: same key → EnqueueJobUseCase / repository converge (existing semantics).
  });

  it("E: scheduler invocation failure does not kill worker drain", async () => {
    const processJobs = vi.fn().mockResolvedValue(
      Result.ok({ claimed: 1, completed: 1, retried: 0, deadLettered: 0 }),
    );
    const processOutbox = vi.fn().mockResolvedValue(
      Result.ok({ claimed: 0, completed: 0, retried: 0, deadLettered: 0 }),
    );

    const failingHook = {
      name: "boom",
      enabled: true,
      intervalMs: 10,
      run: async () => {
        throw new Error("scheduler exploded");
      },
    };

    const runner = new SchedulerRunner({ hooks: [failingHook] });
    runner.start();
    await new Promise((r) => setTimeout(r, 40));
    await runner.stop();

    const loop = new AsyncWorkerLoop({
      processors: { processJobs, processOutbox },
      jobBatchLimit: 10,
      outboxBatchLimit: 10,
      recoveryIntervalMs: 2_000,
    });
    await loop.drainOnce();
    expect(processJobs).toHaveBeenCalled();
  });

  it("F: hold-expiry scheduling enqueues existing expire_holds durable job", async () => {
    const execute = vi.fn().mockResolvedValue(
      Result.ok({
        id: "h1",
        status: "pending",
        jobType: EXPIRE_HOLDS_JOB_TYPE,
      }),
    );
    const hook = createHoldExpirySchedulerHook({
      enabled: true,
      intervalMs: 60_000,
      enqueueJob: { execute },
    });
    const result = await hook.run({
      signal: new AbortController().signal,
      now: () => new Date("2026-09-22T12:01:00.000Z"),
    });
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      jobType: EXPIRE_HOLDS_JOB_TYPE,
      payload: { limit: 100 },
    });
    expect(result?.enqueued).toBe(1);
  });

  it("G: hold-expiry scheduler failure does not stop other worker processing", async () => {
    const holdHook = createHoldExpirySchedulerHook({
      enabled: true,
      intervalMs: 10,
      enqueueJob: {
        execute: async () => Result.fail(new Error("enqueue failed")),
      },
    });
    const icalExecute = vi.fn().mockResolvedValue(
      Result.ok({
        examined: 0,
        enqueuedPolls: 0,
        skipped: 0,
        enqueuedSweep: 0,
        skippedReasons: {
          inFlight: 0,
          deadLetter: 0,
          sameBucketTerminal: 0,
          providerNotRegistered: 0,
          enqueueFailed: 0,
        },
      }),
    );
    const icalHook = createIcalPollSchedulerHook({
      enabled: true,
      intervalMs: 10,
      scheduleIcalPolls: { execute: icalExecute },
    });

    const runner = new SchedulerRunner({ hooks: [holdHook, icalHook] });
    runner.start();
    await new Promise((r) => setTimeout(r, 50));
    await runner.stop();

    expect(icalExecute.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("H: scheduler hooks support independent cadences", () => {
    const config = loadWorkerSchedulerConfig({
      WORKER_ICAL_SCHEDULER_INTERVAL_MS: "900000",
      WORKER_HOLD_EXPIRY_SCHEDULER_INTERVAL_MS: "60000",
      WORKER_PROVIDER_RETRIEVAL_SCHEDULER_INTERVAL_MS: "5000",
    } as NodeJS.ProcessEnv);

    expect(config.icalSchedulerIntervalMs).toBe(900_000);
    expect(config.holdExpirySchedulerIntervalMs).toBe(60_000);
    expect(config.providerRetrievalSchedulerIntervalMs).toBe(5_000);
  });

  it("I: disabled scheduler does not run", async () => {
    const execute = vi.fn();
    const hook = createIcalPollSchedulerHook({
      enabled: false,
      intervalMs: 10,
      scheduleIcalPolls: { execute },
    });
    const runner = new SchedulerRunner({ hooks: [hook] });
    runner.start();
    await new Promise((r) => setTimeout(r, 30));
    await runner.stop();
    expect(execute).not.toHaveBeenCalled();
  });

  it("J: graceful shutdown stops new scheduler ticks", async () => {
    let calls = 0;
    const hook = {
      name: "counting",
      enabled: true,
      intervalMs: 15,
      run: async () => {
        calls += 1;
      },
    };
    const runner = new SchedulerRunner({ hooks: [hook] });
    runner.start();
    await new Promise((r) => setTimeout(r, 25));
    await runner.stop();
    const afterStop = calls;
    await new Promise((r) => setTimeout(r, 40));
    expect(calls).toBe(afterStop);
  });

  it("L: future provider retrieval hook cannot bypass Channel ingress architecture", () => {
    const files = [
      "providerRetrievalHook.ts",
      "icalPollScheduler.ts",
      "holdExpiryScheduler.ts",
      "buildSchedulerHooks.ts",
      "SchedulerRunner.ts",
      "types.ts",
    ];
    for (const file of files) {
      const source = readFileSync(
        resolve(import.meta.dirname, `../src/scheduler/${file}`),
        "utf8",
      );
      const importLines = source
        .split(/\r?\n/)
        .filter((line) => /^\s*import\b/.test(line))
        .join("\n");
      for (const pattern of PROVIDER_RETRIEVAL_SCHEDULER_FORBIDDEN_IMPORT_PATTERNS) {
        expect(importLines).not.toMatch(pattern);
      }
    }

    expect(PROVIDER_RETRIEVAL_SCHEDULER_FORBIDDEN_IMPORT_PATTERNS.length).toBeGreaterThan(0);

    const port = {
      providerId: "future_ota",
      retrieveAndIngress: async () => ({ enqueued: 0 }),
    };
    const hook = createProviderRetrievalSchedulerHook(port, {
      enabled: false,
      intervalMs: 5_000,
    });
    expect(hook.name).toBe(providerRetrievalHookName("future_ota"));
    expect(hook.enabled).toBe(false);
  });

  it("M: worker Production DB safety remains intact via config loader", async () => {
    const { resolveWorkerDatabaseUrl, PRODUCTION_DB_REFUSAL_MESSAGE } =
      await import("@hcp/database");
    expect(() =>
      resolveWorkerDatabaseUrl({
        WORKER_DATABASE_URL:
          "postgresql://postgres.eofmpszxlumqequjqcmp:x@aws-1-eu-north-1.pooler.supabase.com:6543/postgres",
      } as NodeJS.ProcessEnv),
    ).toThrow(PRODUCTION_DB_REFUSAL_MESSAGE);
  });

  it("buildSchedulerHooks wires iCal + hold expiry from config", () => {
    const hooks = buildSchedulerHooks(
      {
        icalSchedulerEnabled: true,
        icalSchedulerIntervalMs: 900_000,
        holdExpirySchedulerEnabled: false,
        holdExpirySchedulerIntervalMs: 60_000,
        holdExpiryJobLimit: 50,
        providerRetrievalSchedulerEnabled: false,
        providerRetrievalSchedulerIntervalMs: 30_000,
      },
      {
        scheduleIcalPollsUseCase: { execute: async () => Result.fail(new Error("x")) },
        enqueueJobUseCase: { execute: async () => Result.fail(new Error("x")) },
      },
    );
    expect(hooks.map((h) => h.name)).toEqual([
      ICAL_POLL_SCHEDULER_HOOK_NAME,
      HOLD_EXPIRY_SCHEDULER_HOOK_NAME,
    ]);
    expect(hooks[0]?.enabled).toBe(true);
    expect(hooks[1]?.enabled).toBe(false);
  });

  it("prevents overlapping in-process scheduler executions", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const hook = {
      name: "slow",
      enabled: true,
      intervalMs: 5,
      run: async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 40));
        concurrent -= 1;
      },
    };
    const runner = new SchedulerRunner({ hooks: [hook] });
    runner.start();
    await new Promise((r) => setTimeout(r, 80));
    await runner.stop();
    expect(maxConcurrent).toBe(1);
  });
});
