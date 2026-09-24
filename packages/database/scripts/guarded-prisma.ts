#!/usr/bin/env tsx
/**
 * Wraps Prisma CLI mutation commands with Talos Production DB refusal.
 *
 * Prefer privileged migration URLs when set:
 *   MIGRATION_DATABASE_URL / MIGRATION_DIRECT_URL
 * otherwise DATABASE_URL / DIRECT_URL.
 *
 * Application runtime should use RUNTIME_DATABASE_URL (talos_runtime).
 *
 * Intentional Production deploys:
 *   ALLOW_TALOS_PRODUCTION_DB_MUTATION=true pnpm --filter @hcp/database db:migrate
 */
import { spawnSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNotTalosProductionDatabase,
  PRODUCTION_DB_REFUSAL_MESSAGE,
} from "../src/safety/databaseTargetGuard.js";

const root = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(root, "../.env") });
loadEnv({ path: resolve(root, "../../../apps/web/.env.local") });

const args = process.argv.slice(2);
const operation = args.join(" ") || "prisma";

const migrationUrl =
  process.env.MIGRATION_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  "";
const migrationDirect =
  process.env.MIGRATION_DIRECT_URL?.trim() ||
  process.env.DIRECT_URL?.trim() ||
  "";

const env = { ...process.env };
if (migrationUrl) env.DATABASE_URL = migrationUrl;
if (migrationDirect) env.DIRECT_URL = migrationDirect;

try {
  assertNotTalosProductionDatabase(env.DATABASE_URL, `prisma ${operation}`);
  if (env.DIRECT_URL) {
    assertNotTalosProductionDatabase(
      env.DIRECT_URL,
      `prisma ${operation} (DIRECT_URL)`,
    );
  }
} catch (error) {
  const message =
    error instanceof Error ? error.message : PRODUCTION_DB_REFUSAL_MESSAGE;
  console.error(message);
  process.exit(1);
}

const result = spawnSync("npx", ["prisma", ...args], {
  stdio: "inherit",
  shell: true,
  cwd: resolve(root, ".."),
  env,
});

process.exit(result.status ?? 1);
