import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  isPublicMarketingPath,
  MARKETING_ROUTES,
  PUBLIC_MARKETING_PATHS,
} from "@/lib/marketing/site";

describe("Meta legal public pages", () => {
  it("allowlists /privacy, /terms, and /data-deletion without login", () => {
    expect(isPublicMarketingPath("/privacy")).toBe(true);
    expect(isPublicMarketingPath("/terms")).toBe(true);
    expect(isPublicMarketingPath("/data-deletion")).toBe(true);
    expect(PUBLIC_MARKETING_PATHS).toContain("/privacy");
    expect(PUBLIC_MARKETING_PATHS).toContain("/terms");
    expect(PUBLIC_MARKETING_PATHS).toContain("/data-deletion");
  });

  it("includes the three legal routes in sitemap marketing routes", () => {
    const paths = MARKETING_ROUTES.map((r) => r.path);
    expect(paths).toContain("/privacy");
    expect(paths).toContain("/terms");
    expect(paths).toContain("/data-deletion");
  });

  it("does not broaden messaging webhook or admin API allowlists", () => {
    const middleware = readFileSync(
      path.join(process.cwd(), "middleware.ts"),
      "utf8",
    );
    expect(middleware).toContain("isPublicMarketingPath");
    expect(middleware).toContain(
      'url.pathname === "/api/messaging/v1/webhooks/whatsapp"',
    );
    expect(middleware).not.toContain(
      'url.pathname.startsWith("/api/messaging/")',
    );
  });

  it("legal pages exist and expose public metadata paths", () => {
    for (const route of ["/privacy", "/terms", "/data-deletion"] as const) {
      const folder =
        route === "/privacy"
          ? "privacy"
          : route === "/terms"
            ? "terms"
            : "data-deletion";
      const source = readFileSync(
        path.join(process.cwd(), `app/(marketing)/${folder}/page.tsx`),
        "utf8",
      );
      expect(source).toContain(`path: "${route}"`);
      expect(source).toContain("buildPageMetadata");
      expect(source).toContain("getContactEmail");
    }
  });
});
