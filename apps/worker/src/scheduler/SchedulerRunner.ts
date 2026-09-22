/**
 * Independent-cadence scheduler runner.
 *
 * - One timer per hook (not tied to recovery sweep)
 * - In-process overlap prevention (skip if previous tick still running)
 * - Multi-replica safety relies on durable job idempotency keys in use cases
 * - Hook failures are logged and isolated — worker continues
 */

import { workerLog } from "../logger";
import type { SchedulerHookDefinition, SchedulerTickContext } from "./types";

export type SchedulerRunnerOptions = {
  hooks: SchedulerHookDefinition[];
  now?: () => Date;
  /** Injectable for tests. */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

type HookRuntime = {
  hook: SchedulerHookDefinition;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
  stopped: boolean;
};

export class SchedulerRunner {
  private readonly runtimes: HookRuntime[] = [];
  private readonly abort = new AbortController();
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly clearTimeoutFn: typeof clearTimeout;
  private readonly now: () => Date;
  private started = false;

  constructor(private readonly options: SchedulerRunnerOptions) {
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
    this.now = options.now ?? (() => new Date());
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    for (const hook of this.options.hooks) {
      if (!hook.enabled) {
        workerLog.info("scheduler_hook_disabled", { hook: hook.name });
        continue;
      }
      if (hook.intervalMs < 1) {
        workerLog.warn("scheduler_hook_invalid_interval", {
          hook: hook.name,
          intervalMs: hook.intervalMs,
        });
        continue;
      }

      const runtime: HookRuntime = {
        hook,
        timer: null,
        inFlight: null,
        stopped: false,
      };
      this.runtimes.push(runtime);
      workerLog.info("scheduler_hook_started", {
        hook: hook.name,
        intervalMs: hook.intervalMs,
      });
      this.arm(runtime, /* immediate */ true);
    }
  }

  /**
   * Stop arming new ticks; wait for in-flight invocations to finish.
   */
  async stop(): Promise<void> {
    if (this.abort.signal.aborted) {
      await Promise.all(this.runtimes.map((r) => r.inFlight).filter(Boolean));
      return;
    }
    workerLog.info("scheduler_shutdown");
    this.abort.abort();
    for (const runtime of this.runtimes) {
      runtime.stopped = true;
      if (runtime.timer) {
        this.clearTimeoutFn(runtime.timer);
        runtime.timer = null;
      }
    }
    await Promise.all(
      this.runtimes.map(async (r) => {
        if (r.inFlight) await r.inFlight;
      }),
    );
  }

  /** Test helper — invoke one hook once (respects enabled + overlap). */
  async tickOnce(hookName: string): Promise<void> {
    const runtime = this.runtimes.find((r) => r.hook.name === hookName);
    const hook =
      runtime?.hook ??
      this.options.hooks.find((h) => h.name === hookName);
    if (!hook || !hook.enabled) return;
    if (runtime) {
      await this.invoke(runtime);
      return;
    }
    // Disabled hooks are not in runtimes — no-op.
  }

  private arm(runtime: HookRuntime, immediate: boolean): void {
    if (runtime.stopped || this.abort.signal.aborted) return;
    const delay = immediate ? 0 : runtime.hook.intervalMs;
    runtime.timer = this.setTimeoutFn(() => {
      runtime.timer = null;
      void this.invoke(runtime).finally(() => {
        this.arm(runtime, false);
      });
    }, delay);
  }

  private async invoke(runtime: HookRuntime): Promise<void> {
    if (runtime.stopped || this.abort.signal.aborted) return;
    if (runtime.inFlight) {
      // Prevent overlapping executions inside this worker process.
      return;
    }

    const runPromise = (async () => {
      const ctx: SchedulerTickContext = {
        signal: this.abort.signal,
        now: this.now,
      };
      try {
        if (ctx.signal.aborted) return;
        const result = await runtime.hook.run(ctx);
        if (result && hasMeaningfulWork(result)) {
          workerLog.info("scheduler_enqueue_result", {
            hook: runtime.hook.name,
            examined: result.examined ?? null,
            enqueued: result.enqueued ?? null,
            skipped: result.skipped ?? null,
            reused: result.reused ?? null,
          });
        }
      } catch (error) {
        workerLog.error("scheduler_invocation_failed", {
          hook: runtime.hook.name,
          reason: error instanceof Error ? error.message : "unknown",
        });
      }
    })();

    runtime.inFlight = runPromise;
    try {
      await runPromise;
    } finally {
      runtime.inFlight = null;
    }
  }
}

function hasMeaningfulWork(result: {
  examined?: number;
  enqueued?: number;
  skipped?: number;
  reused?: number;
}): boolean {
  return (result.enqueued ?? 0) > 0 || (result.reused ?? 0) > 0;
}
