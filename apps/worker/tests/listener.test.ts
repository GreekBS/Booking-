import { describe, expect, it } from "vitest";
import { EventEmitter } from "node:events";
import type { Client } from "pg";
import {
  TALOS_ASYNC_WAKE_JOBS_CHANNEL,
  TALOS_ASYNC_WAKE_OUTBOX_CHANNEL,
} from "@hcp/database";
import { PgWakeListener } from "../src/listener";

class FakeClient extends EventEmitter {
  connected = false;
  ended = false;
  listens: string[] = [];

  async connect(): Promise<void> {
    this.connected = true;
  }

  async query(sql: string): Promise<void> {
    const match = /^LISTEN\s+(\w+)$/.exec(sql.trim());
    if (match) this.listens.push(match[1]!);
  }

  async end(): Promise<void> {
    this.ended = true;
    this.connected = false;
    this.emit("end");
  }
}

describe("PgWakeListener", () => {
  it("J: reconnect after failure re-LISTENs and signals wake (durable work not lost)", async () => {
    const wakes: string[] = [];
    let clientCount = 0;
    const clients: FakeClient[] = [];

    const listener = new PgWakeListener({
      connectionUrl: "postgresql://local/test",
      onWake: (kind) => wakes.push(kind),
      reconnectInitialMs: 10,
      reconnectMaxMs: 20,
      createClient: () => {
        const client = new FakeClient();
        clients.push(client);
        clientCount += 1;
        if (clientCount === 1) {
          queueMicrotask(() => {
            client.emit("error", new Error("simulated disconnect"));
          });
        }
        return client as unknown as Client;
      },
    });

    await listener.start();
    expect(clients[0]?.listens).toEqual([
      TALOS_ASYNC_WAKE_JOBS_CHANNEL,
      TALOS_ASYNC_WAKE_OUTBOX_CHANNEL,
    ]);

    // Allow reconnect backoff.
    await new Promise((r) => setTimeout(r, 80));

    expect(clientCount).toBeGreaterThanOrEqual(2);
    expect(clients[1]?.listens).toEqual([
      TALOS_ASYNC_WAKE_JOBS_CHANNEL,
      TALOS_ASYNC_WAKE_OUTBOX_CHANNEL,
    ]);
    // Reconnect signals wake so pending durable rows are claimed.
    expect(wakes).toContain("any");

    await listener.stop();
  });

  it("forwards channel-specific wake kinds", async () => {
    const wakes: string[] = [];
    let client!: FakeClient;

    const listener = new PgWakeListener({
      connectionUrl: "postgresql://local/test",
      onWake: (kind) => wakes.push(kind),
      createClient: () => {
        client = new FakeClient();
        return client as unknown as Client;
      },
    });

    await listener.start();
    client.emit("notification", { channel: TALOS_ASYNC_WAKE_JOBS_CHANNEL });
    client.emit("notification", { channel: TALOS_ASYNC_WAKE_OUTBOX_CHANNEL });

    expect(wakes).toContain("jobs");
    expect(wakes).toContain("outbox");

    await listener.stop();
  });
});
