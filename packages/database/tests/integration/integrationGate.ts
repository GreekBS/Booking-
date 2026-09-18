/**
 * Shared integration-test gate.
 *
 * Loads packages/database/.env (if present), then applies the TEST_DATABASE_URL
 * contract — never falling back to DATABASE_URL. Suites must gate on exports from
 * this module instead of reading process.env.DATABASE_URL directly.
 */
import { describe } from "vitest";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { applyIntegrationTestDatabaseEnv } from "../../src/safety/databaseTargetGuard";

loadEnv({ path: resolve(import.meta.dirname, "../../.env") });

const status = applyIntegrationTestDatabaseEnv();

/** True only when TEST_DATABASE_URL points at an allowed non-production database. */
export const integrationDatabaseConfigured = status === "configured";

/** `describe` when a safe test DB is configured; otherwise `describe.skip`. */
export const runIntegration = integrationDatabaseConfigured
  ? describe
  : describe.skip;
