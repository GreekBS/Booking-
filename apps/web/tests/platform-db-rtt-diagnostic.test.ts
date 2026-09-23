import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("temporary platform db-rtt diagnostic", () => {
  const routePath = join(
    process.cwd(),
    "app/api/platform/v1/diagnostics/db-rtt/route.ts",
  );
  const helperPath = join(
    process.cwd(),
    "lib/diagnostics/measure-db-rtt.ts",
  );
  const route = readFileSync(routePath, "utf8");
  const helper = readFileSync(helperPath, "utf8");

  it("requires DB-authoritative Super Admin and Node runtime", () => {
    expect(route).toContain('export const runtime = "nodejs"');
    expect(route).toContain("requireSuperAdmin");
    expect(route).toContain("TEMPORARY");
    expect(route).toContain("measureDbRtt");
  });

  it("is read-only timings — no payloads or secrets in response shape", () => {
    expect(helper).toContain("select1");
    expect(helper).toContain("userLookup");
    expect(helper).toContain("tenantLookup");
    expect(helper).toContain("vercelRegion");
    expect(helper).not.toMatch(/password|connectionString/i);
    expect(helper).not.toContain("email:");
    expect(helper).not.toContain("toProps()");
    expect(helper).not.toMatch(
      /\$executeRaw|\$executeRawUnsafe|\.create\(|\.update\(|\.delete\(/,
    );
    expect(route).not.toMatch(/DATABASE_URL|DIRECT_URL|password/i);
  });

  it("discards lookup results and only measures PK reads", () => {
    expect(helper).toContain("select: { id: true }");
    expect(helper).toContain("params.userId");
  });
});
