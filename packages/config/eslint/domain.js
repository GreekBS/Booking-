/** @type {import("eslint").Linter.Config} */
module.exports = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@hcp/database", "@hcp/database/*", "@prisma/client", "@prisma/client/*"],
            message: "Domain layer must not depend on infrastructure packages.",
          },
          {
            group: ["next", "next/*", "react", "react/*"],
            message: "Domain layer must remain framework-agnostic.",
          },
        ],
      },
    ],
  },
};
