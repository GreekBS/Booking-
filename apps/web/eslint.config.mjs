import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import presentationConfig from "@hcp/config/eslint/presentation.js";

const { overrides: presentationOverrides, ...presentationRules } = presentationConfig;

export default defineConfig([
  globalIgnores([".next/**", "node_modules/**", "tests/**", "playwright.config.ts", "next-env.d.ts"]),
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    ...presentationRules,
  },
  ...presentationOverrides.map((override) => ({
    files: override.files,
    rules: override.rules,
  })),
  {
    files: ["app/api/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: presentationRules.rules["no-restricted-imports"][1].patterns,
          paths: [
            {
              name: "@/lib/di/container",
              importNames: [
                "tenantRepository",
                "propertyRepository",
                "userRepository",
                "membershipRepository",
                "invitationRepository",
                "auditLogRepository",
                "amenityRepository",
                "outboxRepository",
                "permissionChecker",
              ],
              message: "API routes must only import use cases from the DI container.",
            },
          ],
        },
      ],
    },
  },
]);
