/**
 * F3.1 architecture invariant: fiscal allocations only enter via issueAtomic.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(root, "../src");

describe("F3.1 fiscal allocation concurrency architecture", () => {
  it("issueAtomic contains FolioLine FOR UPDATE lock before allocation insert", () => {
    const src = readFileSync(
      join(repoRoot, "repositories/fiscal/FiscalDocumentRepositories.ts"),
      "utf8",
    );
    expect(src).toContain("assertAllocationsFitUnderLineLocks");
    expect(src).toContain("FOR UPDATE");
    expect(src).toContain("assertCreditFitsUnderOriginalLock");
    const issueIdx = src.indexOf("async issueAtomic");
    const lockIdx = src.indexOf("assertAllocationsFitUnderLineLocks", issueIdx);
    const createIdx = src.indexOf("fiscalLineAllocation.createMany", issueIdx);
    expect(issueIdx).toBeGreaterThan(-1);
    expect(lockIdx).toBeGreaterThan(issueIdx);
    expect(createIdx).toBeGreaterThan(lockIdx);
  });

  it("no other repository inserts fiscal_line_allocations", () => {
    const hits: string[] = [];
    function walk(dir: string) {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".ts")) {
          const text = readFileSync(p, "utf8");
          const norm = p.replace(/\\/g, "/");
          if (
            /fiscalLineAllocation\.create(Many)?/.test(text) &&
            !norm.endsWith(
              "repositories/fiscal/FiscalDocumentRepositories.ts",
            )
          ) {
            hits.push(norm);
          }
        }
      }
    }
    walk(join(repoRoot, "repositories"));
    expect(hits).toEqual([]);
  });
});
