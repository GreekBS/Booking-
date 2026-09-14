/** @type {import("eslint").Linter.Config} */
module.exports = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["next", "next/*", "react", "react/*"],
            message: "Infrastructure packages must not depend on presentation frameworks.",
          },
        ],
      },
    ],
  },
};
