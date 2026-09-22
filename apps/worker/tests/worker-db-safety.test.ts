import { describe, expect, it, vi } from "vitest";
import {
  PRODUCTION_DB_REFUSAL_MESSAGE,
  TALOS_PRODUCTION_SUPABASE_PROJECT_REF,
  resolveWorkerDatabaseUrl,
  WORKER_DATABASE_URL_ENV,
  TALOS_WORKER_RUNTIME_MODE_ENV,
} from "@hcp/database";
import { applyWorkerDatabaseEnv, loadWorkerConfig } from "../src/config";

function fakeUrl(user: string): string {
  return `postgresql://${user}:super-secret-password-value@aws-1-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true`;
}

const TALOS_PROD_URL = fakeUrl(`postgres.${TALOS_PRODUCTION_SUPABASE_PROJECT_REF}`);
const LOCAL_URL = "postgresql://hcp:hcp@localhost:5432/hcp?schema=public";

describe("worker database safety", () => {
  it("K: refuses Talos Production database target by default", () => {
    expect(() =>
      resolveWorkerDatabaseUrl({
        [WORKER_DATABASE_URL_ENV]: TALOS_PROD_URL,
      } as NodeJS.ProcessEnv),
    ).toThrow(PRODUCTION_DB_REFUSAL_MESSAGE);

    expect(() =>
      resolveWorkerDatabaseUrl({
        DATABASE_URL: TALOS_PROD_URL,
      } as NodeJS.ProcessEnv),
    ).toThrow(PRODUCTION_DB_REFUSAL_MESSAGE);
  });

  it("prefers WORKER_DATABASE_URL over DATABASE_URL", () => {
    const url = resolveWorkerDatabaseUrl({
      [WORKER_DATABASE_URL_ENV]: LOCAL_URL,
      DATABASE_URL: TALOS_PROD_URL,
    } as NodeJS.ProcessEnv);
    expect(url).toBe(LOCAL_URL);
  });

  it("production runtime mode alone cannot open Production without mutation allow", () => {
    expect(() =>
      resolveWorkerDatabaseUrl({
        [WORKER_DATABASE_URL_ENV]: TALOS_PROD_URL,
        [TALOS_WORKER_RUNTIME_MODE_ENV]: "production",
      } as NodeJS.ProcessEnv),
    ).toThrow(PRODUCTION_DB_REFUSAL_MESSAGE);
  });

  it("applyWorkerDatabaseEnv sets DATABASE_URL from safe worker URL", () => {
    const env = {
      [WORKER_DATABASE_URL_ENV]: LOCAL_URL,
      DATABASE_URL: "postgresql://other:x@localhost:5432/other",
    } as NodeJS.ProcessEnv;

    const resolved = applyWorkerDatabaseEnv(env);
    expect(resolved.databaseUrl).toBe(LOCAL_URL);
    expect(env.DATABASE_URL).toBe(LOCAL_URL);
  });

  it("loadWorkerConfig clamps recovery interval to 1–3 seconds", () => {
    const low = loadWorkerConfig({
      [WORKER_DATABASE_URL_ENV]: LOCAL_URL,
      WORKER_RECOVERY_INTERVAL_MS: "100",
    } as NodeJS.ProcessEnv);
    expect(low.recoveryIntervalMs).toBe(1_000);

    const high = loadWorkerConfig({
      [WORKER_DATABASE_URL_ENV]: LOCAL_URL,
      WORKER_RECOVERY_INTERVAL_MS: "99999",
    } as NodeJS.ProcessEnv);
    expect(high.recoveryIntervalMs).toBe(3_000);
  });

  it("does not leak secrets in refusal messages", () => {
    try {
      resolveWorkerDatabaseUrl({
        DATABASE_URL: TALOS_PROD_URL,
      } as NodeJS.ProcessEnv);
      expect.unreachable();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain("super-secret-password-value");
      expect(message).not.toMatch(/postgresql:\/\//i);
    }
  });
});
