import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import databaseConfig from "@hcp/config/eslint/database.js";

export default defineConfig([
  globalIgnores(["dist/**", "node_modules/**"]),
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    ...databaseConfig,
  },
]);
