/** @type {import("eslint").Linter.Config} */
module.exports = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@hcp/database", "@hcp/database/*"],
            message:
              "Presentation layer must not import @hcp/database directly. Use lib/di/container use cases.",
          },
          {
            group: ["@prisma/client", "@prisma/client/*"],
            message: "Prisma client is only allowed in @hcp/database package.",
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: [
        "lib/di/**/*.ts",
        "lib/auth/**/*.ts",
        "lib/diagnostics/**/*.ts",
        "middleware.ts",
      ],
      rules: {
        "no-restricted-imports": "off",
      },
    },
  ],
};
