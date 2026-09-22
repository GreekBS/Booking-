import { describe, expect, it } from "vitest";
import {
  LISTEN_TRANSACTION_POOLER_REFUSAL_MESSAGE,
  assertListenDatabaseUrlCompatible,
  isTransactionPoolerDatabaseUrl,
} from "../src/listenUrlValidation";
import {
  applyWorkerDatabaseEnv,
  loadWorkerConfig,
  shouldLoadLocalDotenv,
} from "../src/config";
import { WorkerHealthState } from "../src/healthState";
import { startHealthServer } from "../src/healthServer";
import {
  PRODUCTION_DB_REFUSAL_MESSAGE,
  TALOS_PRODUCTION_SUPABASE_PROJECT_REF,
  resolveWorkerDatabaseUrl,
} from "@hcp/database";

const LOCAL = "postgresql://hcp:hcp@localhost:5432/hcp?schema=public";
const SESSION_POOLER =
  "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-1-eu-north-1.pooler.supabase.com:5432/postgres";
const TX_POOLER =
  "postgresql://postgres.abcdefghijklmnopqrst:secret@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true";
const TALOS_PROD = `postgresql://postgres.${TALOS_PRODUCTION_SUPABASE_PROJECT_REF}:secret@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;

describe("Railway deployment support", () => {
  it("rejects transaction pooler LISTEN URLs (:6543)", () => {
    expect(isTransactionPoolerDatabaseUrl(TX_POOLER)).toBe(true);
    expect(isTransactionPoolerDatabaseUrl(SESSION_POOLER)).toBe(false);
    expect(isTransactionPoolerDatabaseUrl(LOCAL)).toBe(false);

    expect(() => assertListenDatabaseUrlCompatible(TX_POOLER)).toThrow(
      LISTEN_TRANSACTION_POOLER_REFUSAL_MESSAGE,
    );
    expect(() => assertListenDatabaseUrlCompatible(SESSION_POOLER)).not.toThrow();
  });

  it("applyWorkerDatabaseEnv refuses transaction pooler for LISTEN", () => {
    expect(() =>
      applyWorkerDatabaseEnv({
        WORKER_DATABASE_URL: LOCAL,
        WORKER_LISTEN_DATABASE_URL: TX_POOLER,
      } as NodeJS.ProcessEnv),
    ).toThrow(LISTEN_TRANSACTION_POOLER_REFUSAL_MESSAGE);
  });

  it("Production dual gate still fails closed", () => {
    expect(() =>
      resolveWorkerDatabaseUrl({
        WORKER_DATABASE_URL: TALOS_PROD,
      } as NodeJS.ProcessEnv),
    ).toThrow(PRODUCTION_DB_REFUSAL_MESSAGE);

    expect(() =>
      resolveWorkerDatabaseUrl({
        WORKER_DATABASE_URL: TALOS_PROD,
        TALOS_WORKER_RUNTIME_MODE: "production",
      } as NodeJS.ProcessEnv),
    ).toThrow(PRODUCTION_DB_REFUSAL_MESSAGE);
  });

  it("shouldLoadLocalDotenv is false on Railway / production mode", () => {
    expect(shouldLoadLocalDotenv({ RAILWAY_ENVIRONMENT: "production" })).toBe(
      false,
    );
    expect(
      shouldLoadLocalDotenv({ TALOS_WORKER_RUNTIME_MODE: "production" }),
    ).toBe(false);
    expect(shouldLoadLocalDotenv({ NODE_ENV: "production" })).toBe(false);
    expect(shouldLoadLocalDotenv({})).toBe(true);
  });

  it("startup config validation loads safe non-production URLs", () => {
    const config = loadWorkerConfig({
      WORKER_DATABASE_URL: LOCAL,
      WORKER_LISTEN_DATABASE_URL: LOCAL,
      WORKER_HEALTH_PORT: "8099",
    } as NodeJS.ProcessEnv);
    expect(config.listenDatabaseUrl).toBe(LOCAL);
    expect(config.healthPort).toBe(8099);
  });

  it("health snapshot has no secrets and degraded LISTEN still shows recovery alive", () => {
    const health = new WorkerHealthState({ recoveryAliveWindowMs: 60_000 });
    health.markProcessStarted();
    health.setProcessingDbOk(true);
    health.setListenerStatus("disconnected");
    health.markRecoverySweep();
    health.markSchedulerStarted();

    const snap = health.snapshot();
    expect(snap.status).toBe("degraded");
    expect(snap.recoveryLoopAlive).toBe(true);
    expect(snap.processingDbOk).toBe(true);
    expect(snap.listener).toBe("disconnected");

    const serialized = JSON.stringify(snap);
    expect(serialized).not.toMatch(/postgresql:/i);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("password");
  });

  it("health HTTP response contains no secrets and returns 200 when degraded with recovery", async () => {
    const health = new WorkerHealthState({ recoveryAliveWindowMs: 60_000 });
    health.markProcessStarted();
    health.setProcessingDbOk(true);
    health.setListenerStatus("disconnected");
    health.markRecoverySweep();
    health.markSchedulerStarted();

    const server = await startHealthServer(health, { port: 0 });
    try {
      const res = await fetch(`http://127.0.0.1:${server.port}/healthz`);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain('"status":"degraded"');
      expect(body).toContain('"recoveryLoopAlive":true');
      expect(body).not.toMatch(/postgresql:/i);
      expect(body).not.toContain("secret");
    } finally {
      await server.close();
    }
  });
});
