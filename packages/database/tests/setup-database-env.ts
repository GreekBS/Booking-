/**
 * Defense-in-depth: ensure TEST_DATABASE_URL contract after any env loading.
 * Suites still gate on process.env.DATABASE_URL at collection time — vitest.config
 * must clear Production before collection (envDir must not reload packages/database/.env).
 */
import { applyIntegrationTestDatabaseEnv } from "../src/safety/databaseTargetGuard";

applyIntegrationTestDatabaseEnv();
