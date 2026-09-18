import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARKETING_ROUTES } from "@/lib/marketing/site";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Get started CTA mapping", () => {
  it("routes acquisition CTAs to /get-started with allowlisted sources", () => {
    expect(read("components/marketing/MarketingNav.tsx")).toContain(
      "/get-started?source=homepage_nav",
    );
    expect(read("components/marketing/sections/HeroSection.tsx")).toContain(
      "/get-started?source=homepage_hero",
    );
    expect(read("components/marketing/sections/FinalCtaSection.tsx")).toContain(
      "/get-started?source=homepage_final",
    );
    expect(read("app/(marketing)/pms/page.tsx")).toContain(
      "/get-started?source=pms",
    );
    expect(read("app/(marketing)/website-builder/page.tsx")).toContain(
      "/get-started?source=website_builder",
    );
    expect(read("app/(marketing)/direct-bookings/page.tsx")).toContain(
      "/get-started?source=direct_bookings",
    );
    expect(read("app/(marketing)/channel-manager/page.tsx")).toContain(
      "/get-started?source=channel_manager",
    );
    expect(read("app/(marketing)/vacation-rental-software/page.tsx")).toContain(
      "/get-started?source=vacation_rental_software",
    );
    expect(read("app/(marketing)/property-management/page.tsx")).toContain(
      "/get-started?source=property_management",
    );
    expect(read("app/(marketing)/contact/page.tsx")).toContain(
      "/get-started?source=contact",
    );
    expect(
      read("components/marketing/sections/ManagedServiceSection.tsx"),
    ).toContain("/get-started?source=property_management");
  });

  it("keeps Create account / register auth destinations intact", () => {
    expect(read("features/auth/CredentialsSignInForm.tsx")).toContain(
      'href="/register"',
    );
    expect(read("app/(auth)/register/page.tsx")).toMatch(/RegisterForm/);
    expect(read("features/get-started/GetStartedWizard.tsx")).toContain(
      'href="/register"',
    );
  });

  it("excludes /get-started from sitemap routes", () => {
    expect(MARKETING_ROUTES.some((r) => r.path === "/get-started")).toBe(false);
    expect(MARKETING_ROUTES.some((r) => r.path === "/privacy")).toBe(true);
  });
});
