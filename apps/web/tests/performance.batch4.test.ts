import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Performance Batch 4 — DB round-trip reduction", () => {
  const domainRoot = join(process.cwd(), "..", "..", "packages", "domain", "src");
  const webRoot = process.cwd();

  it("ResolveTenantContextUseCase parallelizes User and Tenant reads", () => {
    const source = readFileSync(
      join(domainRoot, "identity", "application", "ResolveTenantContextUseCase.ts"),
      "utf8",
    );
    expect(source).toMatch(/Promise\.all\(/);
    expect(source).toMatch(/userRepository\.findById/);
    expect(source).toMatch(/tenantRepository\.findById/);
    expect(source).toMatch(/jwtPlatformRole/);
  });

  it("requireTenantContext does not await requireSession before authority resolve", () => {
    const source = readFileSync(join(webRoot, "lib", "tenant-context.ts"), "utf8");
    const fnStart = source.indexOf("export const requireTenantContext");
    const fnBody = source.slice(fnStart, fnStart + 1800);
    expect(fnBody).toMatch(/getAuthSession/);
    expect(fnBody).toMatch(/resolveTenantContextUseCase\.execute/);
    expect(fnBody).not.toMatch(/await requireSession\(/);
  });

  it("batch authorize path uses one-shot unit+property context", () => {
    const source = readFileSync(
      join(domainRoot, "commerce", "application", "BatchCalendarReadUseCases.ts"),
      "utf8",
    );
    expect(source).toMatch(/getUnitPropertyContextsByUnitIds/);
    expect(source).not.toMatch(/getUnitsByIds\(/);
    expect(source).not.toMatch(/getPropertiesByIds\(/);
  });
});
