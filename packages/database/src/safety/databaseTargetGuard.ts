/**
 * Fail-closed database target safety for Talos.
 *
 * Identifies the known Talos Production Supabase project by connection identity
 * (postgres.<project-ref> username), not by shared pooler hostname alone.
 *
 * Never log or throw full connection URLs, passwords, or credentials.
 */

export const TALOS_PRODUCTION_SUPABASE_PROJECT_REF = "eofmpszxlumqequjqcmp";

export const PRODUCTION_DB_REFUSAL_MESSAGE =
  "REFUSING TO RUN DATABASE TEST/MUTATION AGAINST TALOS PRODUCTION DATABASE";

const ALLOW_PRODUCTION_MUTATION_ENV = "ALLOW_TALOS_PRODUCTION_DB_MUTATION";

/**
 * Explicit opt-in: run integration suites against the configured Talos
 * development/demo DB when TEST_DATABASE_URL is absent.
 *
 * Talos currently has one demo/development database for migrations and
 * controlled integration verification. This flag must be set deliberately
 * (dedicated npm script / authorized verification) so ordinary `pnpm test`
 * never mutates DATABASE_URL by accident.
 */
export const ALLOW_TALOS_DEMO_DB_INTEGRATION_ENV =
  "ALLOW_TALOS_DEMO_DB_INTEGRATION";

/**
 * Extract Supabase project reference from a PostgreSQL connection URL.
 * Supports pooler usernames shaped as `postgres.<project-ref>`.
 * Returns null when the URL is missing/invalid or has no identifiable project ref.
 */
export function extractSupabaseProjectRef(
  connectionUrl: string | undefined | null,
): string | null {
  if (!connectionUrl || typeof connectionUrl !== "string") return null;
  const trimmed = connectionUrl.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  const username = decodeURIComponent(parsed.username || "");
  const match = /^postgres\.([a-z0-9]+)$/i.exec(username);
  if (!match) return null;
  return match[1]!.toLowerCase();
}

export function isTalosProductionDatabaseUrl(
  connectionUrl: string | undefined | null,
): boolean {
  const ref = extractSupabaseProjectRef(connectionUrl);
  return ref === TALOS_PRODUCTION_SUPABASE_PROJECT_REF;
}

/**
 * Throws a safe Error when the URL targets Talos Production.
 * Intentional Production mutations require ALLOW_TALOS_PRODUCTION_DB_MUTATION=true.
 */
export function assertNotTalosProductionDatabase(
  connectionUrl: string | undefined | null,
  operationLabel: string,
): void {
  if (!isTalosProductionDatabaseUrl(connectionUrl)) return;

  const allow =
    process.env[ALLOW_PRODUCTION_MUTATION_ENV]?.trim() === "true";
  if (allow) return;

  throw new Error(
    `${PRODUCTION_DB_REFUSAL_MESSAGE} (operation=${operationLabel}). ` +
      `Use an isolated non-production database. ` +
      `Intentional Production mutations require ${ALLOW_PRODUCTION_MUTATION_ENV}=true.`,
  );
}

/**
 * Resolve the database URL for integration tests.
 *
 * Priority:
 * 1. TEST_DATABASE_URL when set (preferred isolated target)
 * 2. RUNTIME_DATABASE_URL / DATABASE_URL only when
 *    ALLOW_TALOS_DEMO_DB_INTEGRATION=true (authorized Talos demo/dev workflow)
 *
 * Never silently falls back to DATABASE_URL without the opt-in flag.
 * Production project refs still require ALLOW_TALOS_PRODUCTION_DB_MUTATION=true.
 *
 * @returns sanitized URL string, or null when tests should skip (missing config)
 */
export function resolveIntegrationTestDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const testUrl = env.TEST_DATABASE_URL?.trim() ?? "";
  if (testUrl) {
    assertNotTalosProductionDatabase(testUrl, "integration-test");
    return testUrl;
  }

  const demoOptIn =
    env[ALLOW_TALOS_DEMO_DB_INTEGRATION_ENV]?.trim() === "true";
  if (!demoOptIn) {
    return null;
  }

  const demoUrl =
    env.RUNTIME_DATABASE_URL?.trim() ||
    env.DATABASE_URL?.trim() ||
    "";
  if (!demoUrl) {
    return null;
  }

  assertNotTalosProductionDatabase(demoUrl, "integration-test-demo-db");
  return demoUrl;
}

/**
 * Resolve the database URL for the Talos async worker.
 *
 * Prefer WORKER_DATABASE_URL; otherwise DATABASE_URL.
 * Refuses Talos Production unless TALOS_WORKER_RUNTIME_MODE=production
 * (reserved for a future Production worker activation — not enabled by default).
 */
export const WORKER_DATABASE_URL_ENV = "WORKER_DATABASE_URL";
export const TALOS_WORKER_RUNTIME_MODE_ENV = "TALOS_WORKER_RUNTIME_MODE";

export function resolveWorkerDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const url =
    env[WORKER_DATABASE_URL_ENV]?.trim() ||
    env.RUNTIME_DATABASE_URL?.trim() ||
    env.DATABASE_URL?.trim() ||
    "";
  if (!url) {
    throw new Error(
      "Worker database URL missing. Set WORKER_DATABASE_URL (preferred), RUNTIME_DATABASE_URL, or DATABASE_URL " +
        "to an isolated non-production database.",
    );
  }

  if (isTalosProductionDatabaseUrl(url)) {
    const mode = env[TALOS_WORKER_RUNTIME_MODE_ENV]?.trim();
    if (mode !== "production") {
      throw new Error(
        `${PRODUCTION_DB_REFUSAL_MESSAGE} (operation=async-worker). ` +
          `Local/dev workers must use an isolated non-production database. ` +
          `Future Production workers require ${TALOS_WORKER_RUNTIME_MODE_ENV}=production.`,
      );
    }
    // Future Production activation still requires the explicit mutation allow-list
    // so a mis-set mode alone cannot open Production by accident during this phase.
    assertNotTalosProductionDatabase(url, "async-worker-production-mode");
  }

  return url;
}

/**
 * After dotenv loads a possibly-Production DATABASE_URL, replace the process env
 * used by integration suites with the resolved integration URL — or clear DB URLs
 * so suites skip without mutating an unintended target.
 */
function clearProcessDatabaseUrl(
  env: NodeJS.ProcessEnv,
  key: string,
): void {
  // Blank then delete — on some hosts inherited env keys resist delete alone.
  env[key] = "";
  delete env[key];
}

/**
 * Clear runtime/worker URL overrides that would otherwise win over DATABASE_URL
 * inside resolveRuntimeDatabaseUrl() / worker resolvers during integration tests.
 */
function clearRuntimeDatabaseOverrides(env: NodeJS.ProcessEnv): void {
  clearProcessDatabaseUrl(env, "RUNTIME_DATABASE_URL");
  clearProcessDatabaseUrl(env, "RUNTIME_DIRECT_URL");
  clearProcessDatabaseUrl(env, WORKER_DATABASE_URL_ENV);
  clearProcessDatabaseUrl(env, "WORKER_LISTEN_DATABASE_URL");
}

export function applyIntegrationTestDatabaseEnv(
  env: NodeJS.ProcessEnv = process.env,
): "configured" | "missing" {
  const resolved = resolveIntegrationTestDatabaseUrl(env);

  if (!resolved) {
    clearProcessDatabaseUrl(env, "DATABASE_URL");
    clearProcessDatabaseUrl(env, "DIRECT_URL");
    clearRuntimeDatabaseOverrides(env);
    return "missing";
  }

  env.DATABASE_URL = resolved;
  const testDirect = env.TEST_DIRECT_URL?.trim();
  if (testDirect) {
    assertNotTalosProductionDatabase(testDirect, "integration-test-direct");
    env.DIRECT_URL = testDirect;
  } else {
    env.DIRECT_URL = resolved;
  }
  // @hcp/database client prefers RUNTIME_DATABASE_URL over DATABASE_URL.
  // Leaving a Production runtime URL set would bypass TEST_DATABASE_URL remap.
  clearRuntimeDatabaseOverrides(env);
  return "configured";
}
