import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import domainConfig from "@hcp/config/eslint/domain.js";

export default defineConfig([
  globalIgnores(["dist/**", "node_modules/**", "tests/fixtures/**"]),
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    ...domainConfig,
  },
]);
