/**
 * PostgreSQL LISTEN/NOTIFY wake listener (best-effort).
 *
 * NOTIFY is not durable. Lost signals are recovered by the worker sweep.
 * Payloads are ignored; channels only indicate that work may exist.
 */

import pg from "pg";
import {
  TALOS_ASYNC_WAKE_JOBS_CHANNEL,
  TALOS_ASYNC_WAKE_OUTBOX_CHANNEL,
  type TalosAsyncWakeChannel,
} from "@hcp/database";
import { workerLog } from "./logger";

export type WakeKind = "jobs" | "outbox" | "any";

export type WakeListenerOptions = {
  connectionUrl: string;
  onWake: (kind: WakeKind) => void;
  onFailure?: (error: unknown) => void;
  reconnectInitialMs?: number;
  reconnectMaxMs?: number;
  /** Injectable for tests. */
  createClient?: (url: string) => pg.Client;
};

export class PgWakeListener {
  private client: pg.Client | null = null;
  private stopped = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly createClient: (url: string) => pg.Client;

  constructor(private readonly options: WakeListenerOptions) {
    this.createClient =
      options.createClient ?? ((url) => new pg.Client({ connectionString: url }));
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    await this.disconnectQuietly();
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;

    await this.disconnectQuietly();

    try {
      const client = this.createClient(this.options.connectionUrl);
      this.client = client;

      client.on("notification", (msg) => {
        const channel = msg.channel;
        if (channel === TALOS_ASYNC_WAKE_JOBS_CHANNEL) {
          this.options.onWake("jobs");
        } else if (channel === TALOS_ASYNC_WAKE_OUTBOX_CHANNEL) {
          this.options.onWake("outbox");
        } else {
          this.options.onWake("any");
        }
      });

      client.on("error", (err) => {
        workerLog.error("listener_failure", {
          reason: err instanceof Error ? err.message : "unknown",
        });
        this.options.onFailure?.(err);
        void this.scheduleReconnect();
      });

      client.on("end", () => {
        if (!this.stopped) {
          workerLog.warn("listener_disconnected");
          void this.scheduleReconnect();
        }
      });

      await client.connect();
      await client.query(`LISTEN ${TALOS_ASYNC_WAKE_JOBS_CHANNEL}`);
      await client.query(`LISTEN ${TALOS_ASYNC_WAKE_OUTBOX_CHANNEL}`);

      const reconnected = this.reconnectAttempt > 0;
      this.reconnectAttempt = 0;
      workerLog.info(reconnected ? "listener_reconnected" : "listener_connected", {
        channels: `${TALOS_ASYNC_WAKE_JOBS_CHANNEL},${TALOS_ASYNC_WAKE_OUTBOX_CHANNEL}`,
      });

      // After reconnect, signal recovery so pending durable work is not missed.
      this.options.onWake("any");
    } catch (error) {
      workerLog.error("listener_failure", {
        reason: error instanceof Error ? error.message : "connect_failed",
      });
      this.options.onFailure?.(error);
      await this.scheduleReconnect();
    }
  }

  private async scheduleReconnect(): Promise<void> {
    if (this.stopped) return;
    if (this.reconnectTimer) return;

    const initial = this.options.reconnectInitialMs ?? 500;
    const max = this.options.reconnectMaxMs ?? 30_000;
    const delay = Math.min(max, initial * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private async disconnectQuietly(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (!client) return;
    try {
      client.removeAllListeners();
      await client.end();
    } catch {
      // ignore
    }
  }
}

export type { TalosAsyncWakeChannel };
