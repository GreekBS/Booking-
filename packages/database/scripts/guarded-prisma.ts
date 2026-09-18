#!/usr/bin/env tsx
/**
 * Wraps Prisma CLI mutation commands with Talos Production DB refusal.
 *
 * Intentional Production deploys:
 *   ALLOW_TALOS_PRODUCTION_DB_MUTATION=true pnpm --filter @hcp/database db:migrate
 *
 * Raw `npx prisma …` bypasses this wrapper — see README.
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

const args = process.argv.slice(2);
const operation = args.join(" ") || "prisma";

try {
  assertNotTalosProductionDatabase(process.env.DATABASE_URL, `prisma ${operation}`);
  if (process.env.DIRECT_URL) {
    assertNotTalosProductionDatabase(process.env.DIRECT_URL, `prisma ${operation} (DIRECT_URL)`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : PRODUCTION_DB_REFUSAL_MESSAGE;
  console.error(message);
  process.exit(1);
}

const result = spawnSync("npx", ["prisma", ...args], {
  stdio: "inherit",
  shell: true,
  cwd: resolve(root, ".."),
  env: process.env,
});

process.exit(result.status ?? 1);
