import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const COMMERCE_ROOT = join(process.cwd(), "src", "commerce");

const FORBIDDEN_IMPORT_PATTERNS = [
  /@prisma\/client/,
  /@hcp\/database/,
  /from ['"]next\//,
  /from ['"]react['"]/,
  /from ['"]react\//,
  /from ['"]node:/,
  /from ['"]crypto['"]/,
  /from ['"]fs['"]/,
];

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectTsFiles(fullPath));
    } else if (entry.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("Commerce domain architecture boundaries", () => {
  const commerceFiles = collectTsFiles(COMMERCE_ROOT);

  it("includes commerce source files", () => {
    expect(commerceFiles.length).toBeGreaterThan(10);
  });

  it.each(commerceFiles)("has no forbidden imports: %s", (filePath) => {
    const source = readFileSync(filePath, "utf8");
    const rel = relative(process.cwd(), filePath);
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      expect(source, `${rel} must not match ${pattern}`).not.toMatch(pattern);
    }
  });
});
