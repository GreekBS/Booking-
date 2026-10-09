import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  adminNavItems,
  adminNavSections,
} from "@/components/admin/admin-sidebar";
import { elNav } from "@/lib/i18n";
import {
  AdminApiError,
  formatWebsiteApiError,
} from "@/features/website/website-api";
import {
  websiteStatusLabel,
  websiteThemeLabel,
} from "@/features/website/theme-labels";

const ROOT = process.cwd();

describe("website builder A4 dashboard foundation", () => {
  it("adds Website Builder under Distribution nav", () => {
    expect(elNav.website).toBe("Ιστότοπος");
    expect(adminNavItems.some((i) => i.href === "/dashboard/website")).toBe(
      true,
    );
    const distribution = adminNavSections.find((s) => s.id === "distribution");
    expect(distribution).toBeDefined();
    expect(
      distribution!.items.map((i) => i.href),
    ).toEqual(
      expect.arrayContaining([
        "/dashboard/channels",
        "/dashboard/website",
      ]),
    );
  });

  it("exposes tenant dashboard website page (not a separate CMS app)", () => {
    const page = join(
      ROOT,
      "app",
      "(dashboard)",
      "dashboard",
      "website",
      "page.tsx",
    );
    expect(existsSync(page)).toBe(true);
    const src = readFileSync(page, "utf8");
    expect(src).toContain("WebsitePage");
    expect(src).not.toMatch(/login|sign-?in|cms/i);
  });

  it("UI calls real A3 admin website APIs and stays read-only for draft", () => {
    const api = readFileSync(
      join(ROOT, "features", "website", "website-api.ts"),
      "utf8",
    );
    expect(api).toContain("/properties/");
    expect(api).toContain("/website");
    expect(api).toContain("adminFetch");
    expect(api).toContain("method: \"POST\"");

    const page = readFileSync(
      join(ROOT, "features", "website", "WebsitePage.tsx"),
      "utf8",
    );
    expect(page).toContain("getWebsiteBundle");
    expect(page).toContain("ensureWebsite");
    expect(page).toContain("useActiveProperty");
    expect(page).toContain("website-create-button");
    expect(page).toContain("website-overview-card");
    expect(page).toContain("website-draft-card");
    expect(page).toContain("Δεν υπάρχει ιστότοπος");
    // A4 scope: no editor, publish, media, DNS, theme gallery
    expect(page).not.toMatch(/publishWebsite|saveDraft|uploadMedia|customDomain/i);
    expect(page).not.toMatch(/theme gallery|ThemePreview|content editor/i);
  });

  it("gates create action on admin/manager (API remains authoritative)", () => {
    const page = readFileSync(
      join(ROOT, "features", "website", "WebsitePage.tsx"),
      "utf8",
    );
    expect(page).toContain('membership?.role === "admin"');
    expect(page).toContain('membership?.role === "manager"');
    expect(page).toContain("canEditWebsite");
    expect(page).toContain(
      "Δεν έχετε δικαίωμα δημιουργίας ιστότοπου για αυτό το κατάλυμα.",
    );
  });

  it("uses responsive layout patterns native to Talos admin", () => {
    const page = readFileSync(
      join(ROOT, "features", "website", "WebsitePage.tsx"),
      "utf8",
    );
    expect(page).toContain("lg:grid-cols-2");
    expect(page).toContain("flex-wrap");
    expect(page).toContain("PageHeader");
    expect(page).toContain("EmptyState");
    expect(page).toContain("ErrorState");
    expect(page).toContain("Skeleton");
  });

  it("maps theme and status labels for overview summary", () => {
    expect(websiteThemeLabel("unset")).toBe("Μη επιλεγμένο");
    expect(websiteThemeLabel("luxury_villa")).toContain("Luxury");
    expect(websiteThemeLabel("unknown_theme_x")).toBe("unknown_theme_x");
    expect(websiteStatusLabel("draft")).toBe("Πρόχειρο");
    expect(websiteStatusLabel("published")).toBe("Δημοσιευμένο");
  });

  it("formats API errors for 403/401/409 without leaking internals", () => {
    expect(
      formatWebsiteApiError(new AdminApiError("FORBIDDEN", "nope", 403)),
    ).toMatch(/δικαίωμα/);
    expect(
      formatWebsiteApiError(new AdminApiError("UNAUTHORIZED", "nope", 401)),
    ).toMatch(/σύνδεση/i);
    expect(
      formatWebsiteApiError(new AdminApiError("CONFLICT", "race", 409)),
    ).toMatch(/συγκρούστηκε|Ανανεώστε/);
    expect(formatWebsiteApiError(new Error("boom"))).toBe("boom");
  });
});
