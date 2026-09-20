import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("marketing lead public surface", () => {
  it("middleware allowlists only lead create + demo paths", () => {
    const source = readFileSync(path.join(process.cwd(), "middleware.ts"), "utf8");
    expect(source).toContain('url.pathname === "/api/marketing/v1/leads"');
    expect(source).toContain(
      "/^\\/api\\/marketing\\/v1\\/leads\\/[^/]+\\/demo$/.test(url.pathname)",
    );
    expect(source).not.toContain('url.pathname.startsWith("/api/marketing/")');
  });

  it("lead route does not create tenants or users", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app/api/marketing/v1/leads/route.ts"),
      "utf8",
    );
    expect(source).toContain("createLeadUseCase");
    expect(source).not.toContain("registerUserUseCase");
    expect(source).not.toContain("createTenantUseCase");
  });

  it("demo route only requests demo and does not mutate status", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app/api/marketing/v1/leads/[leadId]/demo/route.ts"),
      "utf8",
    );
    expect(source).toContain("requestLeadDemoUseCase");
    expect(source).not.toContain("updateLeadStatusUseCase");
    expect(source).not.toContain("changeStatus");
  });
});
