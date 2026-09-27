/**
 * Authorized CleaningLocation V1 integration against the configured Talos
 * development/demo database.
 *
 * Explicit opt-in: sets ALLOW_TALOS_DEMO_DB_INTEGRATION=true so the integration
 * gate may use RUNTIME_DATABASE_URL / DATABASE_URL when TEST_DATABASE_URL is absent.
 *
 * Does NOT activate workers, schedulers, or channel providers.
 * Creates only isolated cl-v1-* tenants and cleans them up via the suite hooks.
 *
 * IMPORTANT: dotenv is loaded here BEFORE vitest boots so Prisma binds the
 * intended runtime URL (prefer RUNTIME_DATABASE_URL / talos_runtime).
 */
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  ALLOW_TALOS_DEMO_DB_INTEGRATION_ENV,
  isTalosProductionDatabaseUrl,
  assertNotTalosProductionDatabase,
} from "../src/safety/databaseTargetGuard";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../.env") });
loadEnv({ path: resolve(root, "../../../apps/web/.env.local") });

process.env[ALLOW_TALOS_DEMO_DB_INTEGRATION_ENV] = "true";

const dbUrl =
  process.env.RUNTIME_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.TEST_DATABASE_URL?.trim() ||
  "";

if (!dbUrl) {
  console.error(
    JSON.stringify({
      ok: false,
      error:
        "No database URL configured. Set RUNTIME_DATABASE_URL, DATABASE_URL, or TEST_DATABASE_URL.",
    }),
  );
  process.exit(1);
}

if (isTalosProductionDatabaseUrl(dbUrl)) {
  if (process.env.ALLOW_TALOS_PRODUCTION_DB_MUTATION?.trim() !== "true") {
    assertNotTalosProductionDatabase(dbUrl, "cleaning-locations-v1-integration");
  }
}

const vitestBin = resolve(root, "../node_modules/vitest/vitest.mjs");
const args = [
  vitestBin,
  "run",
  "tests/integration/CleaningLocationV1.integration.test.ts",
  "tests/integration/rls.integration.test.ts",
  "--reporter=verbose",
];

const child = spawn(process.execPath, args, {
  cwd: resolve(root, ".."),
  stdio: "inherit",
  env: {
    ...process.env,
    [ALLOW_TALOS_DEMO_DB_INTEGRATION_ENV]: "true",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
