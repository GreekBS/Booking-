import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

interface E2EContext {
  tenantAId: string;
  tenantBId: string;
  propertyBId: string;
  email: string;
  password: string;
}

function loadContext(): E2EContext {
  const file = path.join(process.cwd(), "tests/e2e/.auth/context.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as E2EContext;
}

test.describe("Cross-tenant isolation", () => {
  test("tenant A session cannot list tenant B property", async ({ page, request }) => {
    const ctx = loadContext();

    await page.goto("/login");
    await page.fill('input[type="email"]', ctx.email);
    await page.fill('input[type="password"]', ctx.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(dashboard|platform)/, { timeout: 30_000 });

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const listResponse = await request.get("/api/admin/v1/properties", {
      headers: {
        cookie: cookieHeader,
        "x-tenant-id": ctx.tenantAId,
      },
    });

    expect(listResponse.ok()).toBeTruthy();
    const body = await listResponse.json();
    const ids = body.data?.map((p: { id: string }) => p.id) ?? [];
    expect(ids).not.toContain(ctx.propertyBId);

    const directResponse = await request.get(`/api/admin/v1/properties/${ctx.propertyBId}`, {
      headers: {
        cookie: cookieHeader,
        "x-tenant-id": ctx.tenantAId,
      },
    });

    expect(directResponse.status()).toBeGreaterThanOrEqual(400);
  });
});
