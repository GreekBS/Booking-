import { describe, expect, it } from "vitest";
import {
  TALOS_PRODUCTION_SUPABASE_PROJECT_REF,
  PRODUCTION_DB_REFUSAL_MESSAGE,
  extractSupabaseProjectRef,
  isTalosProductionDatabaseUrl,
  assertNotTalosProductionDatabase,
  resolveIntegrationTestDatabaseUrl,
  applyIntegrationTestDatabaseEnv,
  resolveWorkerDatabaseUrl,
} from "../../src/safety/databaseTargetGuard";

function fakeUrl(opts: {
  user: string;
  host?: string;
  password?: string;
}): string {
  const host = opts.host ?? "aws-1-eu-north-1.pooler.supabase.com";
  const password = opts.password ?? "super-secret-password-value";
  return `postgresql://${opts.user}:${password}@${host}:6543/postgres?pgbouncer=true`;
}

const TALOS_PROD_URL = fakeUrl({
  user: `postgres.${TALOS_PRODUCTION_SUPABASE_PROJECT_REF}`,
});

const OTHER_PROJECT_SAME_HOST = fakeUrl({
  user: "postgres.abcdefghijklmnopqrst",
});

const LOCAL_URL = "postgresql://hcp:hcp@localhost:5432/hcp?schema=public";

describe("databaseTargetGuard", () => {
  it("extracts Supabase project ref from postgres.<ref> username", () => {
    expect(extractSupabaseProjectRef(TALOS_PROD_URL)).toBe(
      TALOS_PRODUCTION_SUPABASE_PROJECT_REF,
    );
    expect(extractSupabaseProjectRef(OTHER_PROJECT_SAME_HOST)).toBe(
      "abcdefghijklmnopqrst",
    );
    expect(extractSupabaseProjectRef(LOCAL_URL)).toBeNull();
  });

  it("identifies Talos Production by project ref, not pooler hostname alone", () => {
    expect(isTalosProductionDatabaseUrl(TALOS_PROD_URL)).toBe(true);
    expect(isTalosProductionDatabaseUrl(OTHER_PROJECT_SAME_HOST)).toBe(false);
    expect(isTalosProductionDatabaseUrl(LOCAL_URL)).toBe(false);
  });

  it("rejects Talos Production with a safe message (no secrets)", () => {
    expect(() =>
      assertNotTalosProductionDatabase(TALOS_PROD_URL, "unit-test"),
    ).toThrow(PRODUCTION_DB_REFUSAL_MESSAGE);

    try {
      assertNotTalosProductionDatabase(TALOS_PROD_URL, "unit-test");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain("super-secret-password-value");
      expect(message).not.toContain(TALOS_PROD_URL);
      expect(message).not.toMatch(/postgresql:\/\//i);
    }
  });

  it("accepts non-production URLs", () => {
    expect(() =>
      assertNotTalosProductionDatabase(LOCAL_URL, "unit-test"),
    ).not.toThrow();
    expect(() =>
      assertNotTalosProductionDatabase(OTHER_PROJECT_SAME_HOST, "unit-test"),
    ).not.toThrow();
  });

  it("allows Production only with explicit ALLOW_TALOS_PRODUCTION_DB_MUTATION=true", () => {
    const previous = process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION;
    try {
      process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION = "true";
      expect(() =>
        assertNotTalosProductionDatabase(TALOS_PROD_URL, "controlled-migrate"),
      ).not.toThrow();
    } finally {
      if (previous === undefined) {
        delete process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION;
      } else {
        process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION = previous;
      }
    }
  });

  it("resolveIntegrationTestDatabaseUrl never falls back to DATABASE_URL", () => {
    const env = {
      DATABASE_URL: TALOS_PROD_URL,
      DIRECT_URL: TALOS_PROD_URL,
    } as NodeJS.ProcessEnv;

    expect(resolveIntegrationTestDatabaseUrl(env)).toBeNull();
  });

  it("resolveIntegrationTestDatabaseUrl rejects Production TEST_DATABASE_URL", () => {
    const env = {
      TEST_DATABASE_URL: TALOS_PROD_URL,
      DATABASE_URL: LOCAL_URL,
    } as NodeJS.ProcessEnv;

    expect(() => resolveIntegrationTestDatabaseUrl(env)).toThrow(
      PRODUCTION_DB_REFUSAL_MESSAGE,
    );
  });

  it("resolveIntegrationTestDatabaseUrl accepts non-production TEST_DATABASE_URL", () => {
    const env = {
      TEST_DATABASE_URL: LOCAL_URL,
      DATABASE_URL: TALOS_PROD_URL,
    } as NodeJS.ProcessEnv;

    expect(resolveIntegrationTestDatabaseUrl(env)).toBe(LOCAL_URL);
  });

  it("applyIntegrationTestDatabaseEnv clears Production DATABASE_URL when TEST is missing", () => {
    const env = {
      DATABASE_URL: TALOS_PROD_URL,
      DIRECT_URL: TALOS_PROD_URL,
    } as NodeJS.ProcessEnv;

    expect(applyIntegrationTestDatabaseEnv(env)).toBe("missing");
    expect(env.DATABASE_URL).toBeFalsy();
    expect(env.DIRECT_URL).toBeFalsy();
  });

  it("applyIntegrationTestDatabaseEnv wires TEST_DATABASE_URL and ignores DATABASE_URL", () => {
    const env = {
      TEST_DATABASE_URL: LOCAL_URL,
      DATABASE_URL: TALOS_PROD_URL,
      DIRECT_URL: TALOS_PROD_URL,
    } as NodeJS.ProcessEnv;

    expect(applyIntegrationTestDatabaseEnv(env)).toBe("configured");
    expect(env.DATABASE_URL).toBe(LOCAL_URL);
    expect(env.DIRECT_URL).toBe(LOCAL_URL);
  });

  it("resolveWorkerDatabaseUrl refuses Talos Production by default", () => {
    expect(() =>
      resolveWorkerDatabaseUrl({
        WORKER_DATABASE_URL: TALOS_PROD_URL,
      } as NodeJS.ProcessEnv),
    ).toThrow(PRODUCTION_DB_REFUSAL_MESSAGE);

    expect(() =>
      resolveWorkerDatabaseUrl({
        DATABASE_URL: TALOS_PROD_URL,
      } as NodeJS.ProcessEnv),
    ).toThrow(PRODUCTION_DB_REFUSAL_MESSAGE);
  });

  it("resolveWorkerDatabaseUrl prefers WORKER_DATABASE_URL", () => {
    expect(
      resolveWorkerDatabaseUrl({
        WORKER_DATABASE_URL: LOCAL_URL,
        DATABASE_URL: TALOS_PROD_URL,
      } as NodeJS.ProcessEnv),
    ).toBe(LOCAL_URL);
  });

  it("resolveWorkerDatabaseUrl production mode still requires mutation allow-list", () => {
    expect(() =>
      resolveWorkerDatabaseUrl({
        WORKER_DATABASE_URL: TALOS_PROD_URL,
        TALOS_WORKER_RUNTIME_MODE: "production",
      } as NodeJS.ProcessEnv),
    ).toThrow(PRODUCTION_DB_REFUSAL_MESSAGE);
  });
});
