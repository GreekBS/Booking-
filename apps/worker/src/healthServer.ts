/**
 * Minimal HTTP health endpoint for Railway healthchecks / ops.
 * Binds to PORT (Railway) or WORKER_HEALTH_PORT (default 8080).
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import type { WorkerHealthState } from "./healthState";
import { workerLog } from "./logger";

export type HealthServer = {
  port: number;
  close: () => Promise<void>;
};

export async function startHealthServer(
  health: WorkerHealthState,
  options?: { port?: number },
): Promise<HealthServer> {
  const requested =
    options?.port ??
    Number.parseInt(process.env.WORKER_HEALTH_PORT || process.env.PORT || "8080", 10);

  const server = http.createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/healthz" || req.url === "/health")) {
      const body = health.snapshot();
      // Degraded LISTEN with recovery still alive → 200 so Railway does not flap-restart.
      // Unusable processing DB / not started → 503.
      const httpOk =
        body.processStarted &&
        body.processingDbOk &&
        (body.status === "ok" || body.status === "degraded");
      res.writeHead(httpOk ? 200 : 503, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(body));
      return;
    }

    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requested, "0.0.0.0", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const port = address.port;
  workerLog.info("health_server_listening", { port });

  return {
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
