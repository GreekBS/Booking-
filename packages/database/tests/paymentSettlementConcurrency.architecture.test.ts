/**
 * F4 architecture invariant: payment allocation/refund mutations only via PaymentRepositories atomic paths.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(root, "../src");

const ALLOWED = "repositories/billing/PaymentRepositories.ts";

const MUTATION_PATTERNS = [
  /paymentAllocation\.create(Many)?/,
  /paymentAllocationReversal\.create(Many)?/,
  /paymentRefund\.create(Many)?/,
];

describe("F4 payment settlement concurrency architecture", () => {
  it("atomic paths lock payments and folios before allocation insert", () => {
    const src = readFileSync(join(repoRoot, ALLOWED), "utf8");
    expect(src).toContain("lockPaymentForUpdate");
    expect(src).toContain("FOR UPDATE");
    expect(src).toContain("lockFoliosForUpdate");
    const recordIdx = src.indexOf("async recordPaymentAtomic");
    const allocateIdx = src.indexOf("async allocateAtomic");
    expect(recordIdx).toBeGreaterThan(-1);
    expect(allocateIdx).toBeGreaterThan(-1);
    const lockIdx = src.indexOf("lockPaymentForUpdate", allocateIdx);
    const createIdx = src.indexOf("paymentAllocation.create", allocateIdx);
    expect(lockIdx).toBeGreaterThan(allocateIdx);
    expect(createIdx).toBeGreaterThan(lockIdx);
  });

  it("no other repository mutates payment_allocations or payment_refunds", () => {
    const hits: string[] = [];
    function walk(dir: string) {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".ts")) {
          const text = readFileSync(p, "utf8");
          const norm = p.replace(/\\/g, "/");
          if (norm.endsWith(ALLOWED)) continue;
          for (const pattern of MUTATION_PATTERNS) {
            if (pattern.test(text)) {
              hits.push(norm);
              break;
            }
          }
        }
      }
    }
    walk(join(repoRoot, "repositories"));
    expect(hits).toEqual([]);
  });
});
