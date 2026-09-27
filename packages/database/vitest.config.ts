import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";
import { applyIntegrationTestDatabaseEnv } from "./src/safety/databaseTargetGuard";

const root = path.dirname(fileURLToPath(import.meta.url));

// Load packages/database/.env and apps/web/.env.local (demo workflow),
// then remap via TEST_DATABASE_URL or ALLOW_TALOS_DEMO_DB_INTEGRATION —
// otherwise clear so suites skip without mutating an unintended DB.
loadEnv({ path: path.join(root, ".env") });
loadEnv({ path: path.join(root, "../../apps/web/.env.local") });
applyIntegrationTestDatabaseEnv();

export default defineConfig({
  // Prevent Vite/Vitest from re-injecting packages/database/.env into process.env
  // after the safety remap (default envDir is the package root).
  envDir: path.join(root, "tests", "vitest-env-empty"),
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup-database-env.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
