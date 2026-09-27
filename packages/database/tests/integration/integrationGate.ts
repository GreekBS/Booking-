/**
 * Shared integration-test gate.
 *
 * Loads packages/database/.env and apps/web/.env.local (if present), then applies
 * the integration DB contract:
 * - TEST_DATABASE_URL when set, OR
 * - configured Talos demo/dev DB when ALLOW_TALOS_DEMO_DB_INTEGRATION=true
 *
 * Without either, suites skip (DATABASE_URL cleared) so ordinary test runs never
 * mutate an unintended database.
 */
import { describe } from "vitest";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { applyIntegrationTestDatabaseEnv } from "../../src/safety/databaseTargetGuard";

loadEnv({ path: resolve(import.meta.dirname, "../../.env") });
loadEnv({ path: resolve(import.meta.dirname, "../../../../apps/web/.env.local") });

const status = applyIntegrationTestDatabaseEnv();

/** True when an allowed integration database URL is configured. */
export const integrationDatabaseConfigured = status === "configured";

/** `describe` when a safe integration DB is configured; otherwise `describe.skip`. */
export const runIntegration = integrationDatabaseConfigured
  ? describe
  : describe.skip;
