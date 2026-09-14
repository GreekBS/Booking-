#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const checks = [
  {
    name: "domain-invalid-import",
    cwd: path.join(root, "packages/domain"),
    file: "tests/fixtures/invalid-import.ts",
  },
  {
    name: "web-invalid-import",
    cwd: path.join(root, "apps/web"),
    file: "tests/fixtures/invalid-import.ts",
  },
];

let failed = false;

for (const check of checks) {
  const result = spawnSync(
    "npx",
    ["eslint", check.file, "--max-warnings", "0"],
    { cwd: check.cwd, shell: true, encoding: "utf8" },
  );

  if (result.status === 0) {
    console.error(`Expected ESLint failure for ${check.name}, but lint passed.`);
    failed = true;
    continue;
  }

  console.log(`OK: ${check.name} correctly rejected (${result.status})`);
}

if (failed) {
  process.exit(1);
}

console.log("Architecture boundary ESLint verification passed.");
