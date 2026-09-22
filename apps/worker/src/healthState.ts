/**
 * Shared worker runtime health snapshot for /healthz and ops.
 * Never includes URLs, secrets, credentials, or payloads.
 */

export type ListenerHealthStatus = "connected" | "disconnected" | "unknown";

export type WorkerHealthSnapshot = {
  status: "ok" | "degraded" | "starting";
  processStarted: boolean;
  processingDbOk: boolean;
  listener: ListenerHealthStatus;
  recoveryLoopAlive: boolean;
  schedulerAlive: boolean;
  lastRecoveryAt: string | null;
  uptimeSeconds: number;
};

export class WorkerHealthState {
  private readonly startedAt = Date.now();
  private processStarted = false;
  private processingDbOk = false;
  private listener: ListenerHealthStatus = "unknown";
  private lastRecoveryAtMs: number | null = null;
  private schedulerStarted = false;
  private lastSchedulerActivityAtMs: number | null = null;
  /** Recovery is considered alive if a drain happened within this window. */
  private readonly recoveryAliveWindowMs: number;

  constructor(options?: { recoveryAliveWindowMs?: number }) {
    this.recoveryAliveWindowMs = options?.recoveryAliveWindowMs ?? 15_000;
  }

  markProcessStarted(): void {
    this.processStarted = true;
  }

  setProcessingDbOk(ok: boolean): void {
    this.processingDbOk = ok;
  }

  setListenerStatus(status: ListenerHealthStatus): void {
    this.listener = status;
  }

  markRecoverySweep(): void {
    this.lastRecoveryAtMs = Date.now();
  }

  markSchedulerStarted(): void {
    this.schedulerStarted = true;
    this.lastSchedulerActivityAtMs = Date.now();
  }

  markSchedulerActivity(): void {
    this.lastSchedulerActivityAtMs = Date.now();
  }

  snapshot(nowMs: number = Date.now()): WorkerHealthSnapshot {
    const recoveryLoopAlive =
      this.lastRecoveryAtMs !== null &&
      nowMs - this.lastRecoveryAtMs <= this.recoveryAliveWindowMs;

    const schedulerAlive =
      this.schedulerStarted &&
      (this.lastSchedulerActivityAtMs === null ||
        nowMs - this.lastSchedulerActivityAtMs <= 30 * 60_000);

    let status: WorkerHealthSnapshot["status"] = "starting";
    if (this.processStarted && this.processingDbOk) {
      status =
        this.listener === "connected" && recoveryLoopAlive
          ? "ok"
          : "degraded";
    }

    return {
      status,
      processStarted: this.processStarted,
      processingDbOk: this.processingDbOk,
      listener: this.listener,
      recoveryLoopAlive,
      schedulerAlive,
      lastRecoveryAt:
        this.lastRecoveryAtMs !== null
          ? new Date(this.lastRecoveryAtMs).toISOString()
          : null,
      uptimeSeconds: Math.floor((nowMs - this.startedAt) / 1000),
    };
  }
}
