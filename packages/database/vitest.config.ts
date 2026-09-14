import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";

loadEnv();

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
